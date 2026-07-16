import type { SupabaseClient } from '@supabase/supabase-js'
import type { OrderMode, OrderStatus } from '@goutatou/db'

export interface ArrivalOrderRow {
  id: string
  restaurantId: string
  mode: OrderMode
  status: OrderStatus
  /**
   * `chat_id` du CLIENT propriétaire de la commande (jointure `customers!inner`) — permet à
   * l'appelant (processor.ts resolveArrivalOrder) de vérifier que l'émetteur du tap `arr:<id>`
   * est bien le client de CETTE commande, pas un autre client du même resto qui aurait rejoué
   * l'id d'une commande qui n'est pas la sienne (cf. drive/arrival-repo.test.ts).
   */
  customerChatId: string
}

export interface ArrivalRepo {
  /**
   * Lecture SÉCURISÉE : filtre `restaurant_id` dans la requête même (pas de check applicatif
   * après coup) — aucune validation croisée entre restaurants n'est possible. `null` si la
   * commande n'existe pas ou appartient à un autre restaurant que celui du canal (mirror
   * autostatus/approval-repo.ts getStatus). Ramène aussi `customerChatId` (jointure `customers`)
   * pour que l'appelant puisse vérifier que l'émetteur du tap est bien le client de la commande.
   */
  getOrder(orderId: string, restaurantId: string): Promise<ArrivalOrderRow | null>
  /**
   * `update orders set arrived_at = now() where id = ? and arrived_at is null` — IDEMPOTENT :
   * renvoie `true` si une ligne a été touchée (1er tap), `false` sinon (déjà arrivé, double-tap,
   * ou id inconnu). La condition `arrived_at is null` est la SEULE garde d'unicité ici ; les
   * gardes multi-tenant/mode/état sont déjà appliquées en amont via `getOrder`.
   */
  markArrived(orderId: string): Promise<boolean>
  /**
   * Repli par contexte (cf. drive/arrival.ts) quand l'id du bouton `arr:<orderId>` ne revient pas
   * au tap : dernière commande Drive de CE client, pour CE resto, encore en attente d'arrivée
   * (`mode = 'drive'`, `arrived_at is null`, `status ∉ {recuperee, annulee}`) — filtrée dans la
   * requête même (mirror `getOrder`, pas de check applicatif après coup). La plus RÉCENTE
   * (`order by created_at desc limit 1`) tranche en cas de plusieurs commandes en attente ;
   * `null` si aucune.
   */
  findPendingDriveOrder(restaurantId: string, customerId: string): Promise<{ id: string } | null>
}

interface OrderRowDb {
  id: string
  restaurant_id: string
  mode: OrderMode
  status: OrderStatus
  customers: { chat_id: string } | { chat_id: string }[] | null
}

export function createArrivalRepo(db: SupabaseClient): ArrivalRepo {
  return {
    async getOrder(orderId, restaurantId) {
      const { data } = await db
        .from('orders')
        .select('id, restaurant_id, mode, status, customers!inner(chat_id)')
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle()
      const row = data as OrderRowDb | null
      if (!row) return null
      // `customers!inner(...)` renvoie un objet pour cette relation belongs-to ; défensif si le
      // client Supabase le sérialise en tableau à un seul élément selon la version.
      const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers
      if (!customer) return null
      return {
        id: row.id, restaurantId: row.restaurant_id, mode: row.mode, status: row.status,
        customerChatId: customer.chat_id,
      }
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

    async findPendingDriveOrder(restaurantId, customerId) {
      const { data } = await db
        .from('orders')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('customer_id', customerId)
        .eq('mode', 'drive')
        .is('arrived_at', null)
        .not('status', 'in', '(recuperee,annulee)')
        .order('created_at', { ascending: false })
        .limit(1)
      const rows = (data ?? []) as { id: string }[]
      return rows.length > 0 ? { id: rows[0].id } : null
    },
  }
}
