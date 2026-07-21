'use client'
import { useState, useTransition } from 'react'
import { formatFcfa } from '@goutatou/db/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { orderItemsSummary } from '@/lib/orders'
import { useTableRefresh } from '@/lib/use-table-refresh'
import { assignDelivery, markDelivered } from './actions'

export type ActiveLivreur = { id: string; name: string }

export type DeliveryRow = {
  id: string
  dispatch_state: 'pending' | 'assigned' | 'delivered'
  livreur: { id: string; name: string; phone: string } | null
  order: {
    order_number: number
    total: number
    delivery_address: string | null
    created_at: string
    verified_at: string | null
    customer_name: string | null
    customer_phone: string
    items: { name: string; qty: number }[]
  }
}

function heure(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Libreville' })
}

function DeliveryCard({
  row,
  livreurs,
  pending,
  onAssign,
  onDelivered,
}: {
  row: DeliveryRow
  livreurs: ActiveLivreur[]
  pending: boolean
  onAssign: (deliveryId: string, livreurId: string) => void
  onDelivered: (deliveryId: string) => void
}) {
  const [choice, setChoice] = useState<string>(row.livreur?.id ?? '')
  const o = row.order
  const digits = o.customer_phone.replace(/\D/g, '')

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-base font-semibold">n°{o.order_number}</span>
        <div className="flex items-center gap-2">
          {o.verified_at && <Badge className="bg-tint-mint text-foreground">✓ Validée</Badge>}
          <span className="text-xs text-muted-foreground">{heure(o.created_at)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{o.customer_name ?? 'Client'}</span>
        <a href={`tel:${o.customer_phone}`} className="w-fit font-mono text-xs text-muted-foreground hover:underline">
          {o.customer_phone}
        </a>
      </div>

      <p className="text-muted-foreground">{orderItemsSummary(o.items)}</p>
      <p className="flex items-start gap-1">📍 <span>{o.delivery_address ?? 'Adresse non précisée'}</span></p>
      <p className="font-semibold text-primary">{formatFcfa(o.total)}</p>

      {row.dispatch_state === 'pending' && (
        <div className="mt-1 flex flex-col gap-2 sm:flex-row">
          <select
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
            className="min-h-11 flex-1 rounded-md border border-input bg-background px-3 text-sm"
            aria-label="Choisir un livreur"
          >
            <option value="">Choisir un livreur…</option>
            {livreurs.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
          <Button
            className="min-h-11"
            disabled={pending || !choice}
            onClick={() => onAssign(row.id, choice)}
          >
            Envoyer au livreur
          </Button>
        </div>
      )}

      {row.dispatch_state === 'assigned' && (
        <div className="mt-1 flex flex-col gap-2">
          <p className="text-muted-foreground">
            🛵 Livreur : <span className="font-medium text-foreground">{row.livreur?.name ?? '—'}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" disabled={pending} onClick={() => onDelivered(row.id)}>
              Marquer livrée
            </Button>
            {row.livreur && choice && (
              <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => onAssign(row.id, choice)}>
                Renvoyer
              </Button>
            )}
            {digits && (
              <Button asChild variant="ghost" className="min-h-11">
                <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">💬 Client</a>
              </Button>
            )}
          </div>
        </div>
      )}

      {row.dispatch_state === 'delivered' && (
        <p className="mt-1 text-muted-foreground">
          ✅ Livrée{row.livreur ? ` par ${row.livreur.name}` : ''}
        </p>
      )}
    </div>
  )
}

export function DeliveryBoard({ rows, livreurs }: { rows: DeliveryRow[]; livreurs: ActiveLivreur[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Une même livraison touche `deliveries` PUIS `orders` : deux abonnements séparés donnaient
  // deux `router.refresh()` pour un seul fait métier. Canal unique + refresh debouncé.
  useTableRefresh({ channelName: 'deliveries-board', tables: ['deliveries', 'orders'] })

  function onAssign(deliveryId: string, livreurId: string) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await assignDelivery(deliveryId, livreurId)
        if (res && !res.ok) setError(res.error ?? 'Livreur assigné, mais l’envoi WhatsApp a échoué.')
      } catch {
        setError('Attribution impossible.')
      }
    })
  }

  function onDelivered(deliveryId: string) {
    setError(null)
    startTransition(async () => {
      try {
        await markDelivered(deliveryId)
      } catch {
        setError('Mise à jour impossible.')
      }
    })
  }

  const pendingRows = rows.filter((r) => r.dispatch_state === 'pending')
  const assignedRows = rows.filter((r) => r.dispatch_state === 'assigned')
  const deliveredRows = rows.filter((r) => r.dispatch_state === 'delivered')

  const columns: { title: string; rows: DeliveryRow[]; empty: string }[] = [
    { title: '📥 À attribuer', rows: pendingRows, empty: 'Aucune livraison en attente.' },
    { title: '🛵 En course', rows: assignedRows, empty: 'Aucune course en cours.' },
    // La page ne charge que la journée en cours (+ les courses encore actives) → libellé explicite.
    { title: '✅ Livrées aujourd’hui', rows: deliveredRows, empty: 'Aucune livraison terminée aujourd’hui.' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {livreurs.length === 0 && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
          Ajoutez d’abord vos livreurs dans <strong>Réglages → Livreurs</strong> pour pouvoir attribuer les commandes.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {columns.map((col) => (
          <section key={col.title} className="flex flex-col gap-3">
            <h2 className="font-display text-sm font-semibold text-muted-foreground">
              {col.title} <span className="tabular-nums">({col.rows.length})</span>
            </h2>
            {col.rows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                {col.empty}
              </p>
            ) : (
              col.rows.map((row) => (
                <DeliveryCard
                  key={row.id}
                  row={row}
                  livreurs={livreurs}
                  pending={pending}
                  onAssign={onAssign}
                  onDelivered={onDelivered}
                />
              ))
            )}
          </section>
        ))}
      </div>
    </div>
  )
}
