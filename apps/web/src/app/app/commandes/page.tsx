import { createSupabaseServer } from '@/lib/supabase/server'
import type { OrderCard } from '@/lib/orders'
import { Board } from './board'

export const dynamic = 'force-dynamic'

export default async function CommandesPage() {
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('orders')
    .select(`id, order_number, status, mode, total, created_at, delivery_address,
             customers(name, phone), drive_slots(label), order_items(name, qty)`)
    .neq('status', 'annulee')
    .gte('created_at', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })

  const orders: OrderCard[] = (data ?? []).map((o) => {
    const customer = o.customers as unknown as { name: string | null; phone: string } | null
    const slot = o.drive_slots as unknown as { label: string } | null
    return {
      id: o.id, order_number: o.order_number, status: o.status, mode: o.mode,
      total: o.total, created_at: o.created_at, delivery_address: o.delivery_address,
      customer_name: customer?.name ?? null, customer_phone: customer?.phone ?? '',
      drive_slot_label: slot?.label ?? null,
      items: (o.order_items as { name: string; qty: number }[]) ?? [],
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-2xl font-semibold">Commandes</h1>
      <Board initialOrders={orders} />
    </div>
  )
}
