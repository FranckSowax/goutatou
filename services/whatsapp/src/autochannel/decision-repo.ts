import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

/** Lot de posts chaîne group-mode partageant le même sondage (approval_message_id = id du sondage). */
export interface PendingApprovalChannelBatch {
  approvalMessageId: string
  restaurantId: string
  postIds: string[]
}

export interface ChannelDecisionChannel {
  token: string
  status: string
}

export interface ChannelDecisionRepo {
  /**
   * Lots `pending_approval` mode 'group' dont le créneau est atteint (scheduled_at <= now) —
   * regroupés par approval_message_id (id du sondage récapitulatif envoyé au groupe).
   */
  listDueGroupBatches(nowIso: string): Promise<PendingApprovalChannelBatch[]>
  getChannel(restaurantId: string): Promise<ChannelDecisionChannel | null>
  /** Sondage validé (Oui > Non, ≥1 Oui) : publication (créneau déjà atteint). */
  approveBatch(postIds: string[]): Promise<void>
  /** Sondage non validé (ou canal indisponible) : annulé, jamais publié. */
  cancelBatch(postIds: string[], error: string): Promise<void>
}

interface DueGroupRow {
  id: string
  restaurant_id: string
  approval_message_id: string
}

export function createChannelDecisionRepo(db: SupabaseClient, tokenKey: string): ChannelDecisionRepo {
  return {
    async listDueGroupBatches(nowIso) {
      // Jointure !inner restaurants pour ne retenir QUE le mode 'group' : les pending_approval
      // mode 'manager' sont traités par le processor (boutons chapp:/chrej:) puis, s'ils expirent,
      // par le channel-posts worker (cf. channelposts/repo.ts cancelExpiredPendingApproval) — jamais ici.
      const { data } = await db
        .from('channel_posts')
        .select('id, restaurant_id, approval_message_id, restaurants!inner(auto_status_validation)')
        .eq('state', 'pending_approval')
        .eq('auto_generated', true)
        .eq('restaurants.auto_status_validation', 'group')
        .not('approval_message_id', 'is', null)
        .lte('scheduled_at', nowIso)
      const rows = (data ?? []) as unknown as DueGroupRow[]
      const batches = new Map<string, PendingApprovalChannelBatch>()
      for (const r of rows) {
        const existing = batches.get(r.approval_message_id)
        if (existing) {
          existing.postIds.push(r.id)
        } else {
          batches.set(r.approval_message_id, {
            approvalMessageId: r.approval_message_id,
            restaurantId: r.restaurant_id,
            postIds: [r.id],
          })
        }
      }
      return Array.from(batches.values())
    },

    async getChannel(restaurantId) {
      const { data } = await db
        .from('whapi_channels')
        .select('token_encrypted, status')
        .eq('restaurant_id', restaurantId)
        .single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },

    async approveBatch(postIds) {
      if (postIds.length === 0) return
      await db.from('channel_posts').update({ state: 'scheduled' }).in('id', postIds)
    },

    async cancelBatch(postIds, error) {
      if (postIds.length === 0) return
      await db.from('channel_posts').update({ state: 'canceled', error }).in('id', postIds)
    },
  }
}
