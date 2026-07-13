import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

/** Lot de statuts group-mode partageant le même sondage (approval_message_id = id du sondage). */
export interface PendingApprovalBatch {
  approvalMessageId: string
  restaurantId: string
  statusIds: string[]
}

export interface DecisionChannel {
  token: string
  status: string
}

export interface DecisionRepo {
  /**
   * Lots `pending_approval` mode 'group' dont le créneau est atteint (scheduled_at <= now) —
   * regroupés par approval_message_id (id du sondage récapitulatif envoyé au groupe).
   */
  listDueGroupBatches(nowIso: string): Promise<PendingApprovalBatch[]>
  getChannel(restaurantId: string): Promise<DecisionChannel | null>
  /** Sondage validé (Oui > Non, ≥1 Oui) : publication immédiate (créneau déjà atteint). */
  approveBatch(statusIds: string[]): Promise<void>
  /** Sondage non validé (ou canal indisponible) : annulé, jamais publié. */
  cancelBatch(statusIds: string[], error: string): Promise<void>
}

interface DueGroupRow {
  id: string
  restaurant_id: string
  approval_message_id: string
}

export function createDecisionRepo(db: SupabaseClient, tokenKey: string): DecisionRepo {
  return {
    async listDueGroupBatches(nowIso) {
      // Jointure !inner restaurants pour ne retenir QUE le mode 'group' : les pending_approval
      // mode 'manager' sont traités par le processor (boutons stapp:/strej:) puis, s'ils expirent,
      // par le status worker (cf. statuses/repo.ts cancelExpiredPendingApproval) — jamais ici.
      const { data } = await db
        .from('statuses')
        .select('id, restaurant_id, approval_message_id, restaurants!inner(auto_status_validation)')
        .eq('state', 'pending_approval')
        .eq('auto_generated', true)
        .eq('restaurants.auto_status_validation', 'group')
        .not('approval_message_id', 'is', null)
        .lte('scheduled_at', nowIso)
      const rows = (data ?? []) as unknown as DueGroupRow[]
      const batches = new Map<string, PendingApprovalBatch>()
      for (const r of rows) {
        const existing = batches.get(r.approval_message_id)
        if (existing) {
          existing.statusIds.push(r.id)
        } else {
          batches.set(r.approval_message_id, {
            approvalMessageId: r.approval_message_id,
            restaurantId: r.restaurant_id,
            statusIds: [r.id],
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

    async approveBatch(statusIds) {
      if (statusIds.length === 0) return
      await db.from('statuses').update({ state: 'scheduled' }).in('id', statusIds)
    },

    async cancelBatch(statusIds, error) {
      if (statusIds.length === 0) return
      await db.from('statuses').update({ state: 'canceled', error }).in('id', statusIds)
    },
  }
}
