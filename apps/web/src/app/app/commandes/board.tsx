'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { formatFcfa } from '@goutatou/db'
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
        <section key={col.status} className="rounded-lg bg-neutral-100 p-3">
          <h2 className="mb-3 font-semibold">{col.title} ({grouped[col.status].length})</h2>
          <div className="flex flex-col gap-3">
            {grouped[col.status].map((o) => {
              const next = nextStatus(o.status)
              return (
                <article key={o.id} className="rounded-lg bg-white p-3 shadow-sm">
                  <div className="flex justify-between font-semibold">
                    <span>n°{o.order_number}</span>
                    <span>{formatFcfa(o.total)}</span>
                  </div>
                  <p className="text-sm text-neutral-600">
                    {o.customer_name ?? o.customer_phone} · {o.mode === 'drive' ? `🚗 ${o.drive_slot_label}` :
                      o.mode === 'livraison' ? `🛵 ${o.delivery_address}` : '🍽️ Sur place'}
                  </p>
                  <ul className="mt-1 text-sm">
                    {o.items.map((it, i) => <li key={i}>{it.qty}× {it.name}</li>)}
                  </ul>
                  <div className="mt-2 flex gap-2">
                    {next && (
                      <button
                        onClick={() => updateOrderStatus(o.id, next)}
                        className="rounded bg-neutral-900 px-2 py-1 text-xs text-white"
                      >
                        → {KANBAN_COLUMNS.find((c) => c.status === next)?.title}
                      </button>
                    )}
                    {o.status === 'recue' && (
                      <button onClick={() => cancelOrder(o.id)} className="rounded border px-2 py-1 text-xs">
                        Annuler
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
