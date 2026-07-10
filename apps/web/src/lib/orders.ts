import type { OrderStatus } from '@goutatou/db'

export interface OrderCard {
  id: string
  order_number: number
  status: OrderStatus
  mode: string
  source?: string
  total: number
  created_at: string
  customer_name: string | null
  customer_phone: string
  drive_slot_label: string | null
  delivery_address: string | null
  items: { name: string; qty: number; unit_price?: number }[]
}

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  recue: 'Reçue',
  en_preparation: 'En préparation',
  prete: 'Prête',
  recuperee: 'Récupérée',
  annulee: 'Annulée',
}

/** Libellé du bouton d'avancement vers l'état suivant. */
export const ADVANCE_LABELS: Partial<Record<OrderStatus, string>> = {
  recue: 'Passer en préparation',
  en_preparation: 'Marquer prête',
  prete: 'Marquer récupérée',
}

/** Version courte pour le bouton en ligne (façon « Print » RushHour). */
export const ROW_ACTION_LABELS: Partial<Record<OrderStatus, string>> = {
  recue: 'Préparer',
  en_preparation: 'Prête',
  prete: 'Récupérée',
}

export const KANBAN_COLUMNS: { status: OrderStatus; title: string }[] = [
  { status: 'recue', title: '📥 Reçues' },
  { status: 'en_preparation', title: '👨‍🍳 En préparation' },
  { status: 'prete', title: '✅ Prêtes' },
  { status: 'recuperee', title: '🏁 Récupérées' },
]

export function groupByStatus(orders: OrderCard[]): Record<OrderStatus, OrderCard[]> {
  const grouped: Record<OrderStatus, OrderCard[]> = {
    recue: [], en_preparation: [], prete: [], recuperee: [], annulee: [],
  }
  for (const o of orders) grouped[o.status].push(o)
  return grouped
}

const FLOW: Partial<Record<OrderStatus, OrderStatus>> = {
  recue: 'en_preparation',
  en_preparation: 'prete',
  prete: 'recuperee',
}

export function nextStatus(s: OrderStatus): OrderStatus | null {
  return FLOW[s] ?? null
}
