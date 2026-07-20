'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Check, Globe, MessageCircle, Phone, Printer, Search } from 'lucide-react'
import { formatFcfa } from '@goutatou/db/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { badgeVariantForOrder } from '@/lib/status-badge'
import { paymentBadge, type PaymentBadgeInfo } from '@/lib/payment'
import {
  ADVANCE_LABELS, driveBadge, groupByStatus, nextStatus, orderItemsSummary, ORDER_STATUS_LABELS,
  type OrderCard,
} from '@/lib/orders'
import { cancelOrder, confirmPayment, updateOrderStatus, verifyOrder } from './actions'

type Filter = 'all' | OrderCard['status']

// Ordre d'affichage du dropdown de statut — reprend l'ordre naturel du pipeline déjà
// utilisé par ORDER_STATUS_LABELS (recue → en_preparation → prete → recuperee, + annulee).
const STATUS_OPTIONS = Object.keys(ORDER_STATUS_LABELS) as OrderCard['status'][]

// Message d'erreur générique des mutations (pattern livraison/board.tsx) : jamais de
// `error.message` brut — masqué par Next en prod, et illisible pour le gérant de toute façon.
const ACTION_ERROR = 'Action impossible — vérifiez votre connexion et réessayez.'

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

function modeLabel(o: OrderCard): { label: string; detail: string | null } {
  if (o.mode === 'drive') return { label: '🚗 Drive', detail: o.drive_slot_label }
  if (o.mode === 'livraison') return { label: '🛵 Livraison', detail: o.delivery_address }
  return { label: '🥡 À emporter', detail: null }
}

/**
 * Badge cuisine Drive (cf. plan CL3) : « 🚗 Drive » en teinte sky atténuée tant que le client
 * n'est pas arrivé, « 🚗 ARRIVÉ » en sky plein une fois `arrived_at` posé (idempotent côté bot,
 * cf. services/whatsapp/src/drive/arrival-repo.ts markArrived). `arrival_note` en `title` natif
 * (tooltip navigateur) — pas de UI dédiée, v1 minimale. Tokens Goutatou uniquement.
 */
function DriveKanbanBadge({ order }: { order: OrderCard }) {
  const badge = driveBadge(order)
  if (!badge) return null
  return (
    <Badge
      title={badge.title ?? undefined}
      className={cn(
        'border-transparent',
        badge.arrived ? 'bg-tint-sky font-semibold text-foreground' : 'bg-tint-sky/50 text-foreground/70',
      )}
    >
      {badge.label}
    </Badge>
  )
}

// Variante de Badge par tonalité paiement (cf. lib/payment.ts) — tokens thème uniquement :
// warning = ambre (à vérifier), success = vert (Airtel confirmé), secondary = discret (cash).
const PAYMENT_BADGE_VARIANT: Record<PaymentBadgeInfo['tone'], 'warning' | 'success' | 'secondary'> = {
  pending: 'warning',
  paid: 'success',
  cash: 'secondary',
}

/** Badge paiement d'une carte — rien pour les commandes sans `payment_method` (historique). */
function PaymentKanbanBadge({ order }: { order: OrderCard }) {
  const badge = paymentBadge(order.payment_method, order.payment_status)
  if (!badge) return null
  return <Badge variant={PAYMENT_BADGE_VARIANT[badge.tone]}>{badge.label}</Badge>
}

export function Board({ initialOrders, initialQuery = '', isTodayView = true }: { initialOrders: OrderCard[]; initialQuery?: string; isTodayView?: boolean }) {
  const router = useRouter()
  // Pas de useState ici : `initialOrders` change à chaque nouveau rendu du Server Component
  // (déclenché par router.refresh() ci-dessous, sur Realtime) — useState(initialOrders) ignorerait
  // cette prop après le montage initial (même type/position → pas de remontage), et le board ne
  // bougerait plus qu'au F5 dur. Rien ne mute `orders` : une simple constante suffit et suit
  // fidèlement chaque nouveau rendu.
  const orders = initialOrders
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState(initialQuery)
  const [selected, setSelected] = useState<OrderCard | null>(null)
  const [pending, startTransition] = useTransition()
  // Erreur de la dernière mutation (réseau/RLS) — remise à zéro au lancement de la suivante,
  // donc effacée dès le prochain succès. Affichée en bandeau discret près des boutons.
  const [actionError, setActionError] = useState<string | null>(null)

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
  const visible = useMemo(() => {
    const byStatus = filter === 'all' ? orders : grouped[filter]
    const needle = q.trim().toLowerCase()
    if (!needle) return byStatus
    return byStatus.filter((o) =>
      String(o.order_number).includes(needle) ||
      (o.customer_name ?? '').toLowerCase().includes(needle) ||
      o.customer_phone.includes(needle),
    )
  }, [orders, grouped, filter, q])

  // La page ne charge que le jour affiché : le bandeau agrège tout le lot (hors annulées).
  const dayOrders = orders.filter((o) => o.status !== 'annulee')
  const dayTotal = dayOrders.reduce((s, o) => s + o.total, 0)
  const next = selected ? nextStatus(selected.status) : null

  function advance(o: OrderCard) {
    const n = nextStatus(o.status)
    if (!n) return
    setActionError(null)
    startTransition(async () => {
      try {
        await updateOrderStatus(o.id, n)
        setSelected(null)
      } catch {
        setActionError(ACTION_ERROR)
      }
    })
  }

  function cancel(o: OrderCard) {
    setActionError(null)
    startTransition(async () => {
      try {
        await cancelOrder(o.id)
        setSelected(null)
      } catch {
        setActionError(ACTION_ERROR)
      }
    })
  }

  /** Vérification humaine (appel/WhatsApp client) — bascule verified_at, garde le modal ouvert. */
  function verify(o: OrderCard, verified: boolean) {
    setActionError(null)
    startTransition(async () => {
      try {
        await verifyOrder(o.id, verified)
        setSelected((cur) => (cur && cur.id === o.id ? { ...cur, verified_at: verified ? new Date().toISOString() : null } : cur))
      } catch {
        setActionError(ACTION_ERROR)
      }
    })
  }

  /** « Paiement reçu ✓ » — confirme un paiement Airtel `a_verifier`. L'action est idempotente
   *  côté serveur ; le badge de la ligne suit via Realtime (router.refresh), le modal est mis à
   *  jour localement comme pour verify(). */
  function confirmPay(o: OrderCard) {
    setActionError(null)
    startTransition(async () => {
      try {
        await confirmPayment(o.id)
        setSelected((cur) => (cur && cur.id === o.id ? { ...cur, payment_status: 'paye' } : cur))
      } catch {
        setActionError(ACTION_ERROR)
      }
    })
  }

  /** Dropdown de statut (colonne Action) : route n'importe quel statut via updateOrderStatus,
   *  avec confirmation FR avant d'annuler (cancelOrder = même appel, zéro effet de bord). */
  function changeStatus(o: OrderCard, status: OrderCard['status']) {
    if (status === o.status) return
    if (status === 'annulee' && !window.confirm(`Annuler la commande n°${o.order_number} ?`)) return
    setActionError(null)
    startTransition(async () => {
      try {
        await updateOrderStatus(o.id, status)
      } catch {
        setActionError(ACTION_ERROR)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bandeau du jour : chiffre d'affaires + recherche */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {isTodayView ? 'Aujourd’hui' : 'Ce jour'} :{' '}
          <span className="font-bold text-primary">{formatFcfa(dayTotal)}</span>
          {' '}· {dayOrders.length} commande{dayOrders.length > 1 ? 's' : ''}
        </p>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="N°, client, téléphone…"
            className="pl-9"
          />
        </div>
      </div>

      {/* Rail de service : le pipeline en un coup d'œil */}
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

      {/* Erreur de mutation (réseau/RLS) — bandeau discret, effacé au prochain succès. */}
      {actionError && (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{actionError}</p>
      )}

      {/* Bandes commande pleine largeur */}
      <div className="divide-y divide-border rounded-2xl border border-border bg-card shadow-xs">
        {/* En-têtes de colonnes (desktop) */}
        <div className="hidden gap-x-4 px-6 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground md:grid md:grid-cols-[6.5rem_7rem_1fr_1.5fr_1fr_8rem_9rem_7.5rem_3rem]">
          <span>N°</span>
          <span>Source</span>
          <span>Client</span>
          <span>Détails</span>
          <span>Mode</span>
          <span className="text-right">Total</span>
          <span className="text-center">Statut</span>
          <span className="text-right">Action</span>
          <span className="text-right">Imprimer</span>
        </div>
        {visible.length === 0 && (
          <p className="py-12 text-center text-muted-foreground">Aucune commande ici pour l&apos;instant.</p>
        )}
        {visible.map((o) => {
          const m = modeLabel(o)
          const details = orderItemsSummary(o.items)
          return (
            <div
              key={o.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(o)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelected(o) } }}
              className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-primary md:grid-cols-[6.5rem_7rem_1fr_1.5fr_1fr_8rem_9rem_7.5rem_3rem] md:px-6"
            >
              {/* N° + heure */}
              <div>
                <p className="font-display text-xl font-semibold leading-tight">n°{o.order_number}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{jour(o.created_at)} · {heure(o.created_at)}</p>
              </div>

              {/* Source */}
              <div className="hidden items-center gap-1.5 text-sm text-muted-foreground md:flex">
                {o.source === 'web'
                  ? <><Globe className="size-4 shrink-0" /> Web</>
                  : <><MessageCircle className="size-4 shrink-0 text-success" /> WhatsApp</>}
              </div>

              {/* Client */}
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 truncate font-medium">
                  <span className="truncate">{o.customer_name ?? 'Client'}</span>
                  {o.verified_at && (
                    <Badge className="shrink-0 bg-tint-mint px-1.5 py-0 text-[10px] text-foreground" title="Commande validée">✓</Badge>
                  )}
                </p>
                <p className="truncate font-mono text-xs text-muted-foreground">{o.customer_phone}</p>
                {details && (
                  <p className="truncate text-xs text-muted-foreground md:hidden" title={details}>{details}</p>
                )}
                {paymentBadge(o.payment_method, o.payment_status) && (
                  <div
                    className="mt-1 flex flex-wrap items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <PaymentKanbanBadge order={o} />
                    {o.payment_method === 'airtel' && o.payment_status === 'a_verifier' && (
                      <Button
                        size="sm"
                        className="min-h-11"
                        disabled={pending}
                        onClick={() => confirmPay(o)}
                      >
                        Paiement reçu ✓
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {/* Détails (desktop) */}
              <div className="hidden min-w-0 md:block">
                {details && <p className="truncate text-sm text-muted-foreground" title={details}>{details}</p>}
              </div>

              {/* Mode */}
              <div className="hidden min-w-0 md:block">
                {o.mode === 'drive' ? (
                  <DriveKanbanBadge order={o} />
                ) : (
                  <p className="text-sm">{m.label}</p>
                )}
                {m.detail && <p className="truncate text-xs text-muted-foreground">{m.detail}</p>}
              </div>

              {/* Total */}
              <p className="whitespace-nowrap text-right text-base font-bold tabular-nums text-primary">{formatFcfa(o.total)}</p>

              {/* Statut */}
              <div className="hidden justify-center md:flex">
                <Badge variant={badgeVariantForOrder(o.status)}>{ORDER_STATUS_LABELS[o.status]}</Badge>
              </div>

              {/* Action rapide : dropdown de statut */}
              <div
                className="col-span-2 flex items-center justify-end gap-2 md:col-span-1"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              >
                <Badge className="md:hidden" variant={badgeVariantForOrder(o.status)}>
                  {ORDER_STATUS_LABELS[o.status]}
                </Badge>
                <Select
                  value={o.status}
                  disabled={pending}
                  onValueChange={(v) => changeStatus(o, v as OrderCard['status'])}
                >
                  <SelectTrigger size="sm" aria-label="Changer le statut de la commande" className="w-full max-w-40 md:max-w-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{ORDER_STATUS_LABELS[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Imprimer */}
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Imprimer le ticket"
                  onClick={(e) => {
                    e.stopPropagation()
                    window.open(`/app/commandes/${o.id}/ticket?print=1`, '_blank', 'noopener')
                  }}
                >
                  <Printer className="size-4" />
                </Button>
              </div>
            </div>
          )
        })}
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
                  {jour(selected.created_at)} à {heure(selected.created_at)} · {modeLabel(selected).label}
                  {modeLabel(selected).detail ? ` · ${modeLabel(selected).detail}` : ''}
                  {' '}· {selected.source === 'web' ? 'commande web' : 'commande WhatsApp'}
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

              {/* Paiement : état Airtel/cash + validation manuelle du transfert Airtel Money */}
              {paymentBadge(selected.payment_method, selected.payment_status) && (
                <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Paiement</span>
                    <PaymentKanbanBadge order={selected} />
                  </div>
                  {selected.payment_method === 'airtel' && selected.payment_status === 'a_verifier' && (
                    <Button className="min-h-11 w-fit" disabled={pending} onClick={() => confirmPay(selected)}>
                      Paiement reçu ✓
                    </Button>
                  )}
                </div>
              )}

              {/* Vérification : contacter le client + confirmer que la commande est réelle */}
              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Vérifier la commande</span>
                  {selected.verified_at && (
                    <Badge className="bg-tint-mint text-foreground">✓ Validée</Badge>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selected.customer_phone && (
                    <>
                      <Button asChild variant="outline" size="sm">
                        <a href={`tel:${selected.customer_phone}`}>
                          <Phone className="size-4" /> Appeler
                        </a>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`https://wa.me/${selected.customer_phone.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="size-4" /> WhatsApp
                        </a>
                      </Button>
                    </>
                  )}
                  {selected.verified_at ? (
                    <Button variant="ghost" size="sm" disabled={pending} onClick={() => verify(selected, false)}>
                      Annuler validation
                    </Button>
                  ) : (
                    <Button size="sm" disabled={pending} onClick={() => verify(selected, true)}>
                      <Check className="size-4" /> Marquer validée
                    </Button>
                  )}
                </div>
              </div>

              {/* Même erreur de mutation, répétée près des boutons du modal. */}
              {actionError && <p className="text-sm text-destructive">{actionError}</p>}

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
