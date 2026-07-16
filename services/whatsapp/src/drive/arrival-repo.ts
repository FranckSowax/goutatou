import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderMode, OrderStatus } from '@goutatou/db'

export interface ArrivalOrderRow {
  id: string
  restaurantId: string
  mode: OrderMode
  status: OrderStatus
}

export interface ArrivalRepo {
  /**
   * Lecture SÉCURISÉE : filtre `restaurant_id` dans la requête même (pas de check applicatif
   * après coup) — aucune validation croisée entre restaurants n'est possible. `null` si la
   * commande n'existe pas ou appartient à un autre restaurant que celui du canal (mirror
   * autostatus/approval-repo.ts getStatus).
   */
  getOrder(orderId: string, restaurantId: string): Promise<ArrivalOrderRow | null>
  /**
   * `update orders set arrived_at = now() where id = ? and arrived_at is null` — IDEMPOTENT :
   * renvoie `true` si une ligne a été touchée (1er tap), `false` sinon (déjà arrivé, double-tap,
   * ou id inconnu). La condition `arrived_at is null` est la SEULE garde d'unicité ici ; les
   * gardes multi-tenant/mode/état sont déjà appliquées en amont via `getOrder`.
   */
  markArrived(orderId: string): Promise<boolean>
}

interface OrderRowDb {
  id: string
  restaurant_id: string
  mode: OrderMode
  status: OrderStatus
}

export function createArrivalRepo(db: SupabaseClient): ArrivalRepo {
  return {
    async getOrder(orderId, restaurantId) {
      const { data } = await db
        .from('orders')
        .select('id, restaurant_id, mode, status')
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle()
      const row = data as OrderRowDb | null
      if (!row) return null
      return { id: row.id, restaurantId: row.restaurant_id, mode: row.mode, status: row.status }
    },

    async markArrived(orderId) {
      const { data } = await db
        .from('orders')
        .update({ arrived_at: new Date().toISOString() })
        .eq('id', orderId)
        .is('arrived_at', null)
        .select('id')
      return ((data ?? []) as { id: string }[]).length > 0
    },
  }
}
