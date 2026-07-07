import type { OrderStatus } from '@goutatou/db'

export interface OrderCard {
  id: string
  order_number: number
  status: OrderStatus
  mode: string
  total: number
  created_at: string
  customer_name: string | null
  customer_phone: string
  drive_slot_label: string | null
  delivery_address: string | null
  items: { name: string; qty: number }[]
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
