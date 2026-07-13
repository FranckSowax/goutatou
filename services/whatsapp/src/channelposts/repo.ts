import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'
import type { ChannelPostKind } from '@goutatou/db'

export interface DueChannelPost {
  id: string
  restaurantId: string
  kind: ChannelPostKind
  content: string
  mediaUrl: string | null
  pollOptions: string[] | null
  waChannelId: string | null
}

export interface ChannelPostChannel { token: string; status: string }

export const CHANNEL_NOT_VALIDATED_IN_TIME_ERROR = 'Non validé à temps — non publié.'

export interface ChannelPostsRepo {
  /**
   * Sécurité « sans réponse = ne pas publier » (mirror statuses/repo.ts) : tout post
   * `pending_approval` MODE GÉRANT dont le créneau est atteint (scheduled_at <= now) et toujours en
   * attente → `canceled`, jamais publié. Le mode 'group' est décidé par channel-decision worker.
   */
  cancelExpiredPendingApproval(nowIso: string): Promise<void>
  claimDue(nowIso: string): Promise<DueChannelPost[]>
  getChannel(restaurantId: string): Promise<ChannelPostChannel | null>
  markPosted(id: string, waMessageId: string | undefined): Promise<void>
  markFailed(id: string, error: string): Promise<void>
}

export function createChannelPostsRepo(db: SupabaseClient, tokenKey: string): ChannelPostsRepo {
  return {
    async cancelExpiredPendingApproval(nowIso) {
      const { data } = await db
        .from('channel_posts')
        .select('id, restaurants!inner(auto_status_validation)')
        .eq('state', 'pending_approval')
        .eq('restaurants.auto_status_validation', 'manager')
        .lte('scheduled_at', nowIso)
      const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
      if (ids.length === 0) return
      await db.from('channel_posts').update({ state: 'canceled', error: CHANNEL_NOT_VALIDATED_IN_TIME_ERROR }).in('id', ids)
    },

    async claimDue(nowIso) {
      // Passe les 'scheduled' échus en 'posting'
      await db.from('channel_posts').update({ state: 'posting' })
        .eq('state', 'scheduled').lte('scheduled_at', nowIso)
      const { data } = await db.from('channel_posts')
        .select('id, restaurant_id, kind, content, media_url, poll_options, restaurants!inner(wa_channel_id)')
        .eq('state', 'posting')
        .not('restaurants.wa_channel_id', 'is', null)
      return ((data ?? []) as unknown as Array<{
        id: string
        restaurant_id: string
        kind: ChannelPostKind
        content: string
        media_url: string | null
        poll_options: string[] | null
        restaurants: { wa_channel_id: string | null }
      }>).map((r) => ({
        id: r.id,
        restaurantId: r.restaurant_id,
        kind: r.kind,
        content: r.content,
        mediaUrl: r.media_url,
        pollOptions: r.poll_options,
        waChannelId: r.restaurants?.wa_channel_id ?? null,
      }))
    },

    async getChannel(restaurantId) {
      const { data } = await db.from('whapi_channels').select('token_encrypted, status')
        .eq('restaurant_id', restaurantId).single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },

    async markPosted(id, waMessageId) {
      await db.from('channel_posts').update({
        state: 'posted', wa_message_id: waMessageId ?? null,
      }).eq('id', id)
    },

    async markFailed(id, error) {
      await db.from('channel_posts').update({ state: 'failed', error }).eq('id', id)
    },
  }
}
