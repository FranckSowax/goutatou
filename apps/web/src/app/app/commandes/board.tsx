'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { formatFcfa } from '@goutatou/db/types'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { badgeVariantForOrder } from '@/lib/status-badge'
import { groupByStatus, KANBAN_COLUMNS, nextStatus, type OrderCard } from '@/lib/orders'
import { cancelOrder, updateOrderStatus } from './actions'

export function Board({ initialOrders }: { initialOrders: OrderCard[] }) {
  const router = useRouter()
  const [orders] = useState(initialOrders)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supabase
      .channel('orders-board')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => router.refresh())
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [router])

  const grouped = groupByStatus(orders)

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {KANBAN_COLUMNS.map((col) => (
        <section key={col.status} className="rounded-xl bg-muted/50 p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <Badge variant={badgeVariantForOrder(col.status)}>{col.title}</Badge>
            <span className="text-sm text-muted-foreground">{grouped[col.status].length}</span>
          </div>
          <div className="flex flex-col gap-3">
            {grouped[col.status].map((o) => {
              const next = nextStatus(o.status)
              return (
                <Card key={o.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-lg font-semibold">n°{o.order_number}</span>
                    <span className="text-base font-bold text-primary">{formatFcfa(o.total)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{o.customer_name ?? o.customer_phone}</p>
                  <div className="mt-1">
                    <Badge variant="secondary">
                      {o.mode === 'drive' ? `🚗 ${o.drive_slot_label}` :
                        o.mode === 'livraison' ? `🛵 ${o.delivery_address}` : '🍽️ Sur place'}
                    </Badge>
                  </div>
                  <ul className="mt-2 text-sm text-muted-foreground">
                    {o.items.map((it, i) => <li key={i}>{it.qty}× {it.name}</li>)}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    {next && (
                      <Button size="sm" onClick={() => updateOrderStatus(o.id, next)}>
                        → {KANBAN_COLUMNS.find((c) => c.status === next)?.title}
                      </Button>
                    )}
                    {o.status === 'recue' && (
                      <Button size="sm" variant="outline" onClick={() => cancelOrder(o.id)}>
                        Annuler
                      </Button>
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
