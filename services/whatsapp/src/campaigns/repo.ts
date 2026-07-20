import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

export interface DueCampaign { id: string; restaurantId: string; body: string; mediaUrl: string | null }
export interface PendingRecipient { recipientId: string; chatId: string; phone: string }
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

/**
 * Bail de reprise d'une campagne restée en 'sending' (audit fiabilité lot B — correctif 2) :
 * une campagne n'est reprise par un tick que si son dernier claim remonte à plus de ce délai.
 * Couvre le seul cas légitime de reprise — une instance morte au milieu de l'envoi (redéploiement
 * Railway, crash) — sans jamais permettre à deux instances de traiter la même campagne en
 * parallèle. En marche nominale la reprise ne sert pas : un tick draine toute la campagne (cf.
 * worker.ts, boucle de lots) puis `finalizeIfDone` la sort de 'sending'.
 */
const RESUME_LEASE_MS = 10 * 60 * 1000

const DUE_COLUMNS = 'id, restaurant_id, body, media_url'

interface DueRow { id: string; restaurant_id: string; body: string; media_url: string | null }

function toDue(rows: DueRow[]): DueCampaign[] {
  return rows.map((c) => ({ id: c.id, restaurantId: c.restaurant_id, body: c.body, mediaUrl: c.media_url }))
}

export function createCampaignRepo(db: SupabaseClient, tokenKey: string): CampaignRepo {
  return {
    async claimScheduledDue(nowIso) {
      // Claim ATOMIQUE (pattern wheel/polls) : `update(...).eq('status', <ancien>).select()` ne
      // renvoie QUE les lignes que CE process a réellement fait basculer — deux instances qui
      // tournent en même temps (fenêtre de redéploiement Railway) ne peuvent donc pas envoyer la
      // même campagne deux fois. L'ancien code faisait l'update puis un `select` de TOUT ce qui
      // était en 'sending', y compris les campagnes déjà prises par l'autre instance.
      const { data: started } = await db.from('campaigns')
        .update({ status: 'sending', started_at: nowIso })
        .eq('status', 'scheduled').lte('scheduled_at', nowIso)
        .select(DUE_COLUMNS)

      // Reprise des campagnes orphelines : 'sending' dont le claim (started_at) a expiré — donc
      // l'instance qui les tenait est morte. Le re-claim est lui aussi un update conditionnel
      // (`.lt('started_at', cutoff)`) : une seule instance peut le gagner.
      const cutoff = new Date(new Date(nowIso).getTime() - RESUME_LEASE_MS).toISOString()
      const { data: resumed } = await db.from('campaigns')
        .update({ started_at: nowIso })
        .eq('status', 'sending').lt('started_at', cutoff)
        .select(DUE_COLUMNS)

      return [...toDue((started ?? []) as DueRow[]), ...toDue((resumed ?? []) as DueRow[])]
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
        .select('id, customers!inner(chat_id, phone, opted_out)')
        .eq('campaign_id', campaignId).eq('status', 'pending')
        .eq('customers.opted_out', false)
        .limit(limit)
      return (data ?? []).map((r) => {
        const c = r.customers as unknown as { chat_id: string; phone: string }
        return { recipientId: r.id, chatId: c.chat_id, phone: c.phone }
      })
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
