import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

export interface DueCampaign { id: string; restaurantId: string; body: string; mediaUrl: string | null }
export interface PendingRecipient { recipientId: string; chatId: string }
export interface CampaignChannel { token: string; status: string }

export interface CampaignRepo {
  claimScheduledDue(nowIso: string): Promise<DueCampaign[]>
  snapshotRecipients(campaignId: string, restaurantId: string): Promise<number>
  nextPendingBatch(campaignId: string, limit: number): Promise<PendingRecipient[]>
  getChannel(restaurantId: string): Promise<CampaignChannel | null>
  markRecipient(recipientId: string, campaignId: string, ok: boolean, error?: string): Promise<void>
  sentTodayCount(restaurantId: string): Promise<number>
  finalizeIfDone(campaignId: string): Promise<void>
  isCanceled(campaignId: string): Promise<boolean>
}

export function createCampaignRepo(db: SupabaseClient, tokenKey: string): CampaignRepo {
  return {
    async claimScheduledDue(nowIso) {
      // Passe les 'scheduled' échues en 'sending'
      await db.from('campaigns').update({ status: 'sending', started_at: nowIso })
        .eq('status', 'scheduled').lte('scheduled_at', nowIso)
      const { data } = await db.from('campaigns')
        .select('id, restaurant_id, body, media_url').eq('status', 'sending')
      return (data ?? []).map((c) => ({ id: c.id, restaurantId: c.restaurant_id, body: c.body, mediaUrl: c.media_url }))
    },
    async snapshotRecipients(campaignId, restaurantId) {
      // Audience figée au lancement : si déjà snapshoté, on ne recalcule plus jamais
      // total_recipients (sinon dérive de l'audience en cours d'envoi et la campagne
      // ne finalise jamais si des opt-outs surviennent en cours de route).
      const { count: existing } = await db.from('campaign_recipients')
        .select('id', { count: 'exact', head: true }).eq('campaign_id', campaignId)
      if ((existing ?? 0) > 0) return existing ?? 0
      const { data: custs } = await db.from('customers').select('id')
        .eq('restaurant_id', restaurantId).eq('opted_out', false)
      const rows = (custs ?? []).map((c) => ({
        campaign_id: campaignId, restaurant_id: restaurantId, customer_id: c.id, status: 'pending',
      }))
      if (rows.length) await db.from('campaign_recipients').upsert(rows, { onConflict: 'campaign_id,customer_id', ignoreDuplicates: true })
      const total = rows.length
      await db.from('campaigns').update({ total_recipients: total }).eq('id', campaignId)
      return total
    },
    async nextPendingBatch(campaignId, limit) {
      // Re-filtre opted_out à l'envoi : un client qui envoie STOP en cours de
      // campagne ne doit plus recevoir aucun message des lots suivants.
      const { data } = await db.from('campaign_recipients')
        .select('id, customers!inner(chat_id, opted_out)')
        .eq('campaign_id', campaignId).eq('status', 'pending')
        .eq('customers.opted_out', false)
        .limit(limit)
      return (data ?? []).map((r) => ({
        recipientId: r.id, chatId: (r.customers as unknown as { chat_id: string }).chat_id,
      }))
    },
    async getChannel(restaurantId) {
      const { data } = await db.from('whapi_channels').select('token_encrypted, status')
        .eq('restaurant_id', restaurantId).single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },
    async markRecipient(recipientId, campaignId, ok, error) {
      await db.from('campaign_recipients').update({
        status: ok ? 'sent' : 'failed', sent_at: ok ? new Date().toISOString() : null, error: error ?? null,
      }).eq('id', recipientId)
      await db.rpc('bump_campaign_counter', { p_campaign_id: campaignId, p_sent: ok ? 1 : 0, p_failed: ok ? 0 : 1 })
    },
    async sentTodayCount(restaurantId) {
      const start = new Date(); start.setHours(0, 0, 0, 0)
      const { count } = await db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('restaurant_id', restaurantId).eq('status', 'sent').gte('sent_at', start.toISOString())
      return count ?? 0
    },
    async finalizeIfDone(campaignId) {
      const { count } = await db.from('campaign_recipients').select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaignId).eq('status', 'pending')
      if ((count ?? 0) === 0) {
        await db.from('campaigns').update({ status: 'sent', finished_at: new Date().toISOString() })
          .eq('id', campaignId).eq('status', 'sending')
      }
    },
    async isCanceled(campaignId) {
      const { data } = await db.from('campaigns').select('status').eq('id', campaignId).single()
      return data?.status === 'canceled'
    },
  }
}
