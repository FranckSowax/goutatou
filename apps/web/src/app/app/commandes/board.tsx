'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { formatFcfa } from '@goutatou/db/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { badgeVariantForOrder } from '@/lib/status-badge'
import {
  ADVANCE_LABELS, groupByStatus, nextStatus, ORDER_STATUS_LABELS, type OrderCard,
} from '@/lib/orders'
import { cancelOrder, updateOrderStatus } from './actions'

type Filter = 'all' | OrderCard['status']

const PILLS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Toutes' },
  { key: 'recue', label: 'Reçues' },
  { key: 'en_preparation', label: 'En préparation' },
  { key: 'prete', label: 'Prêtes' },
  { key: 'recuperee', label: 'Récupérées' },
  { key: 'annulee', label: 'Annulées' },
]

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville',
  })
}

function jour(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', timeZone: 'Africa/Libreville',
  })
}

function modeLabel(o: OrderCard): string {
  if (o.mode === 'drive') return `🚗 Drive${o.drive_slot_label ? ` · ${o.drive_slot_label}` : ''}`
  if (o.mode === 'livraison') return '🛵 Livraison'
  return '🍽️ Sur place'
}

export function Board({ initialOrders }: { initialOrders: OrderCard[] }) {
  const router = useRouter()
  const [orders] = useState(initialOrders)
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<OrderCard | null>(null)
  const [pending, startTransition] = useTransition()

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
  const visible = filter === 'all' ? orders : grouped[filter]
  const next = selected ? nextStatus(selected.status) : null

  function advance(o: OrderCard) {
    const n = nextStatus(o.status)
    if (!n) return
    startTransition(async () => {
      await updateOrderStatus(o.id, n)
      setSelected(null)
    })
  }

  function cancel(o: OrderCard) {
    startTransition(async () => {
      await cancelOrder(o.id)
      setSelected(null)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Rail de service : le pipeline du jour en un coup d'œil */}
      <div className="flex flex-wrap gap-2">
        {PILLS.map((p) => {
          const count = p.key === 'all' ? orders.length : grouped[p.key].length
          const active = filter === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilter(p.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {p.label}
              <span className={cn(
                'rounded-full px-1.5 text-xs tabular-nums',
                active ? 'bg-primary-foreground/20' : 'bg-muted',
              )}>
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-16 pl-4 text-xs uppercase tracking-wider text-muted-foreground">N°</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Client</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wider text-muted-foreground md:table-cell">Articles</TableHead>
              <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Mode</TableHead>
              <TableHead className="hidden text-xs uppercase tracking-wider text-muted-foreground sm:table-cell">Heure</TableHead>
              <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Total</TableHead>
              <TableHead className="pr-4 text-right text-xs uppercase tracking-wider text-muted-foreground">Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Aucune commande ici pour l&apos;instant.
                </TableCell>
              </TableRow>
            )}
            {visible.map((o) => (
              <TableRow
                key={o.id}
                tabIndex={0}
                onClick={() => setSelected(o)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(o) } }}
                className="cursor-pointer focus-visible:outline-2 focus-visible:outline-primary"
              >
                <TableCell className="pl-4 font-display text-base font-semibold">{o.order_number}</TableCell>
                <TableCell>
                  <span className="font-medium">{o.customer_name ?? o.customer_phone}</span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {o.items.reduce((n, it) => n + it.qty, 0)} art.
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">{modeLabel(o)}</TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                  {jour(o.created_at)} · {heure(o.created_at)}
                </TableCell>
                <TableCell className="text-right font-bold text-primary">{formatFcfa(o.total)}</TableCell>
                <TableCell className="pr-4 text-right">
                  <Badge variant={badgeVariantForOrder(o.status)}>{ORDER_STATUS_LABELS[o.status]}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Détail commande */}
      <Dialog open={selected !== null} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <DialogContent className="sm:max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center justify-between gap-3 pr-6">
                  <span className="font-display text-xl">Commande n°{selected.order_number}</span>
                  <Badge variant={badgeVariantForOrder(selected.status)}>
                    {ORDER_STATUS_LABELS[selected.status]}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  {jour(selected.created_at)} à {heure(selected.created_at)} · {modeLabel(selected)}
                  {selected.mode === 'livraison' && selected.delivery_address ? ` · ${selected.delivery_address}` : ''}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2">
                  <span className="font-medium">{selected.customer_name ?? 'Client'}</span>
                  <span className="font-mono text-muted-foreground">{selected.customer_phone}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {selected.items.map((it, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3">
                      <span>
                        <span className="tabular-nums text-muted-foreground">{it.qty}×</span> {it.name}
                      </span>
                      {it.unit_price != null && (
                        <span className="tabular-nums text-muted-foreground">{formatFcfa(it.unit_price * it.qty)}</span>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <span className="text-muted-foreground">Total à encaisser</span>
                  <span className="font-display text-2xl font-semibold text-primary">{formatFcfa(selected.total)}</span>
                </div>
              </div>

              {(next || selected.status === 'recue') && (
                <DialogFooter className="gap-2 sm:gap-2">
                  {selected.status === 'recue' && (
                    <Button variant="destructive" disabled={pending} onClick={() => cancel(selected)}>
                      Annuler la commande
                    </Button>
                  )}
                  {next && (
                    <Button disabled={pending} onClick={() => advance(selected)}>
                      {ADVANCE_LABELS[selected.status]}
                    </Button>
                  )}
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
