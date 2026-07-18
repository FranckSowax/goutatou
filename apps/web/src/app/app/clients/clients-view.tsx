'use client'

import { useMemo, useState, useTransition } from 'react'
import { formatFcfa } from '@goutatou/db/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { filterBySegment, searchClients, type ClientRow, type Segment } from '@/lib/clients'
import { updateCustomerNote } from './actions'

type SegmentFilter = Segment | 'tous'

const SEGMENTS: { key: SegmentFilter; label: string }[] = [
  { key: 'tous', label: 'Tous' },
  { key: 'fidele', label: 'Fidèles' },
  { key: 'inactif', label: 'Inactifs' },
  { key: 'nouveau', label: 'Nouveaux' },
  { key: 'desabonne', label: 'Désabonnés' },
]

/** Date FR courte (ex. « 17 juil. 2026 ») ou « jamais » si absente. */
function formatDateFr(iso: string | null): string {
  if (!iso) return 'jamais'
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-xs">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
    </div>
  )
}

function ClientCard({ client, onOpen }: { client: ClientRow; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-11 w-full flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-accent"
    >
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
          <span className="truncate">{client.name?.trim() || 'Client'}</span>
          {client.optedOut ? (
            <Badge variant="secondary">Désabonné</Badge>
          ) : client.marketingOptIn ? (
            <Badge variant="secondary">Opt-in</Badge>
          ) : null}
        </p>
        <p className="truncate font-mono text-xs text-muted-foreground">{client.phone}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {client.ordersCount} cmd{client.ordersCount > 1 ? 's' : ''}
        </span>
        <span className="font-display font-semibold text-foreground">{formatFcfa(client.ltv)}</span>
        <span className="text-muted-foreground">Dernière : {formatDateFr(client.lastOrderAt)}</span>
      </div>
    </button>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-accent px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  )
}

function ClientSheet({ client, onClose }: { client: ClientRow; onClose: () => void }) {
  const [note, setNote] = useState(client.notes ?? '')
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null)

  const waNumber = client.phone.replace(/\D/g, '')

  function saveNote() {
    setMessage(null)
    startTransition(async () => {
      try {
        await updateCustomerNote(client.id, note)
        setMessage({ kind: 'ok', text: 'Note enregistrée.' })
      } catch {
        setMessage({ kind: 'err', text: 'Enregistrement impossible — réessayez.' })
      }
    })
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{client.name?.trim() || 'Client'}</DialogTitle>
          <DialogDescription className="font-mono">{client.phone}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <StatRow label="Valeur (LTV)" value={formatFcfa(client.ltv)} />
          <StatRow label="Panier moyen" value={formatFcfa(client.avgBasket)} />
          <StatRow
            label="Commandes"
            value={`${client.ordersCount} · dernière ${formatDateFr(client.lastOrderAt)}`}
          />
          <StatRow label="Plat préféré" value={client.favoriteItem?.trim() || '—'} />
          <StatRow label="Client depuis" value={formatDateFr(client.createdAt)} />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="client-note" className="text-sm font-medium text-foreground">
            Note
          </label>
          <Textarea
            id="client-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Préférences, allergies, remarques…"
            rows={3}
          />
          <div className="flex items-center gap-3">
            <Button type="button" onClick={saveNote} disabled={pending} className="min-h-11">
              Enregistrer la note
            </Button>
            {message && (
              <span
                className={cn(
                  'text-sm',
                  message.kind === 'ok' ? 'text-success' : 'text-destructive',
                )}
              >
                {message.text}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" className="min-h-11 flex-1">
            <a href={`tel:${client.phone}`}>📞 Appeler</a>
          </Button>
          <Button asChild variant="outline" className="min-h-11 flex-1">
            <a href={`https://wa.me/${waNumber}`} target="_blank" rel="noopener noreferrer">
              💬 WhatsApp
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ClientsView({ clients }: { clients: ClientRow[] }) {
  const [segment, setSegment] = useState<SegmentFilter>('tous')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const now = useMemo(() => new Date(), [])

  const kpis = useMemo(() => {
    const total = clients.length
    const active30 = clients.filter(
      (c) => c.lastOrderAt && (now.getTime() - new Date(c.lastOrderAt).getTime()) / 86_400_000 <= 30,
    ).length
    const optIns = clients.filter((c) => c.marketingOptIn && !c.optedOut).length
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const newThisMonth = clients.filter((c) => new Date(c.createdAt) >= startOfMonth).length
    return { total, active30, optIns, newThisMonth }
  }, [clients, now])

  const visible = useMemo(() => {
    const bySegment = filterBySegment(clients, segment, now)
    return searchClients(bySegment, query)
  }, [clients, segment, query, now])

  const selected = selectedId ? clients.find((c) => c.id === selectedId) ?? null : null

  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-2xl font-semibold">Clients</h1>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile label="Total clients" value={String(kpis.total)} />
        <KpiTile label="Actifs (30 j)" value={String(kpis.active30)} />
        <KpiTile label="Opt-ins marketing" value={String(kpis.optIns)} />
        <KpiTile label="Nouveaux ce mois" value={String(kpis.newThisMonth)} />
      </div>

      {/* Filtres */}
      <div className="flex flex-col gap-3">
        <nav className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 shadow-xs">
          {SEGMENTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSegment(s.key)}
              className={cn(
                'min-h-11 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors sm:min-h-0',
                s.key === segment
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un nom ou un numéro…"
          className="min-h-11"
        />
      </div>

      {/* Liste */}
      {visible.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Aucun client pour ce filtre.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((c) => (
            <li key={c.id}>
              <ClientCard client={c} onOpen={() => setSelectedId(c.id)} />
            </li>
          ))}
        </ul>
      )}

      {selected && <ClientSheet client={selected} onClose={() => setSelectedId(null)} />}
    </div>
  )
}
