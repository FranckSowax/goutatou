import Link from 'next/link'
import { Store } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import type { OrderCard } from '@/lib/orders'
import { Board } from './board'

export const dynamic = 'force-dynamic'

export default async function CommandesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams
  const supabase = await createSupabaseServer()
  const { data } = await supabase
    .from('orders')
    .select(`id, order_number, status, mode, source, total, created_at, delivery_address,
             arrived_at, arrival_note, verified_at,
             customers(name, phone), drive_slots(label), order_items(name, qty, unit_price)`)
    .gte('created_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .order('position', { referencedTable: 'order_items', ascending: true })

  const orders: OrderCard[] = (data ?? []).map((o) => {
    const customer = o.customers as unknown as { name: string | null; phone: string } | null
    const slot = o.drive_slots as unknown as { label: string } | null
    return {
      id: o.id, order_number: o.order_number, status: o.status, mode: o.mode,
      source: o.source, total: o.total, created_at: o.created_at, delivery_address: o.delivery_address,
      customer_name: customer?.name ?? null, customer_phone: customer?.phone ?? '',
      drive_slot_label: slot?.label ?? null,
      arrived_at: o.arrived_at, arrival_note: o.arrival_note, verified_at: o.verified_at,
      items: (o.order_items as { name: string; qty: number; unit_price: number }[]) ?? [],
    }
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold">Commandes</h1>
          <span className="text-sm text-muted-foreground">7 derniers jours</span>
        </div>
        <Button asChild>
          <Link href="/app/commandes/sur-place">
            <Store className="size-4" />
            Sur Place
          </Link>
        </Button>
      </div>
      <Board key={q ?? ''} initialOrders={orders} initialQuery={q ?? ''} />
    </div>
  )
}
