'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Download, Lock, LockOpen } from 'lucide-react'
import { formatFcfa } from '@goutatou/db/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { cashDayTotal, cashDifference, type CashDay } from '@/lib/cash'
import { breakdownRows, differenceLabel, modeLabel, sourceLabel, type BreakdownRow } from '@/lib/cash-labels'
import { formatDayLabel, shiftDay } from '@/lib/order-day'
import { PrintOnLoad } from '@/app/app/commandes/[id]/ticket/print-on-load'
import { closeCashDay, reopenClosure } from './actions'

export interface ClosureDetail {
  closureNumber: number
  closedAt: string
  countedCash: number | null
  difference: number | null
  note: string | null
}

export interface ClosureHistoryRow {
  closureNumber: number
  day: string
  cashTotal: number
  airtelTotal: number
  countedCash: number | null
  difference: number | null
}

function dayHref(date: string): string {
  return `/app/caisse?date=${date}`
}

function dateTimeFr(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    timeZone: 'Africa/Libreville', dateStyle: 'short', timeStyle: 'short',
  })
}

/** Écart de caisse en toutes lettres : le gérant doit lire « 500 F manquant », pas « −500 ». */
function differenceText(difference: number): string {
  return `${formatFcfa(Math.abs(difference))} ${differenceLabel(difference)}`
}

function Tile({ label, value, hint, tone = 'default' }: {
  label: string
  value: string
  hint?: string
  tone?: 'default' | 'muted'
}) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-xs print:border-black/20 print:shadow-none">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className={cn(
        'font-display text-xl font-bold tracking-tight tabular-nums',
        tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
      )}>
        {value}
      </p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}

function Breakdown({ title, rows }: { title: string; rows: BreakdownRow[] }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-xs print:border-black/20 print:shadow-none">
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune commande.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-foreground">{r.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-medium">{formatFcfa(r.amount)}</span>
                <span className="ml-2 text-muted-foreground">{r.share} %</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function CashView({ day, today, restaurantName, summary, closure, history }: {
  day: string
  today: string
  restaurantName: string | null
  summary: CashDay
  closure: ClosureDetail | null
  history: ClosureHistoryRow[]
}) {
  const router = useRouter()
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [reopenOpen, setReopenOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isTodayView = day === today
  const encaisse = cashDayTotal(summary)
  // Écart en direct pendant la saisie : le champ vide vaut « pas encore compté » (null), pas 0.
  const liveDifference = counted.trim() === ''
    ? null
    : cashDifference(Math.round(Number(counted.replace(',', '.'))), summary.cashTotal)

  const modeRows = breakdownRows(summary.byMode, modeLabel)
  const sourceRows = breakdownRows(summary.bySource, sourceLabel)

  function submitClosure() {
    setError(null)
    startTransition(async () => {
      const fd = new FormData()
      fd.set('day', day)
      fd.set('counted_cash', counted)
      fd.set('note', note)
      const res = await closeCashDay(fd)
      if (res.error) { setError(res.error); return }
      setConfirmOpen(false)
      router.refresh()
    })
  }

  function submitReopen() {
    setError(null)
    startTransition(async () => {
      const res = await reopenClosure(day)
      if (res.error) { setError(res.error); return }
      setReopenOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="font-display text-2xl font-semibold">Caisse</h1>
        {closure && <PrintOnLoad shouldPrint={false} />}
      </div>

      {/* Navigation par jour : flèches + saut direct par `<input type="date">` natif dans un
          formulaire GET (sélecteur système sur mobile, aucun JavaScript requis). */}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button asChild variant="outline" size="icon" aria-label="Jour précédent">
          <Link href={dayHref(shiftDay(day, -1))}><ChevronLeft className="size-4" /></Link>
        </Button>
        {isTodayView ? (
          <Button variant="outline" size="icon" disabled aria-label="Jour suivant">
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button asChild variant="outline" size="icon" aria-label="Jour suivant">
            <Link href={dayHref(shiftDay(day, 1))}><ChevronRight className="size-4" /></Link>
          </Button>
        )}
        <span className="text-sm font-medium capitalize">
          {formatDayLabel(day)}
          {isTodayView && <span className="ml-1 text-muted-foreground">· aujourd’hui</span>}
        </span>
        {!isTodayView && (
          <Button asChild variant="ghost" size="sm" className="ml-1">
            <Link href={dayHref(today)}>Aujourd’hui</Link>
          </Button>
        )}
        <form method="get" action="/app/caisse" className="flex items-center gap-2">
          <label htmlFor="jour-caisse" className="sr-only">Aller à une date</label>
          <input
            id="jour-caisse"
            type="date"
            name="date"
            defaultValue={day}
            max={today}
            className="h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-xs focus-visible:outline-2 focus-visible:outline-primary sm:h-9"
          />
          <Button type="submit" variant="outline" size="sm">Aller</Button>
        </form>
      </div>

      {/* En-tête papier : identifie le Z sur la feuille imprimée (masqué à l'écran). */}
      <div className="hidden print:block">
        <p className="font-display text-lg font-bold">{restaurantName ?? 'Goutatou'}</p>
        <p className="text-sm capitalize">Z de caisse · {formatDayLabel(day)}</p>
        {closure && <p className="text-sm">Z n°{closure.closureNumber} · clôturé le {dateTimeFr(closure.closedAt)}</p>}
      </div>

      {closure && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-success/40 bg-success/10 p-4 print:hidden">
          <Badge variant="success">✅ Journée clôturée</Badge>
          <span className="text-sm font-medium">
            Z n°{closure.closureNumber} — le {dateTimeFr(closure.closedAt)}
          </span>
        </div>
      )}

      {/* Total encaissé : le chiffre du soir. Sur une journée clôturée, il vient de la ligne figée. */}
      <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-5 shadow-xs print:border-black/20 print:shadow-none">
        <p className="text-sm font-medium text-muted-foreground">Total encaissé</p>
        <p className="font-display text-3xl font-bold tracking-tight tabular-nums text-primary">
          {formatFcfa(encaisse)}
        </p>
        <p className="text-xs text-muted-foreground">
          {summary.ordersCount} commande{summary.ordersCount > 1 ? 's' : ''} du jour
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Tile label="Espèces" value={formatFcfa(summary.cashTotal)} hint="Remises au client, payées à la remise" />
        <Tile label="Airtel vérifié" value={formatFcfa(summary.airtelTotal)} hint="Paiements confirmés par le restaurant" />
        <Tile label="En attente" value={formatFcfa(summary.pendingTotal)} hint="Annoncé mais pas encore rentré" tone="muted" />
        <Tile
          label="Annulées"
          value={formatFcfa(summary.canceledTotal)}
          hint={`${summary.canceledCount} commande${summary.canceledCount > 1 ? 's' : ''} annulée${summary.canceledCount > 1 ? 's' : ''}`}
          tone="muted"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Breakdown title="Par mode" rows={modeRows} />
        <Breakdown title="Par canal" rows={sourceRows} />
      </div>

      {/* Journée ouverte : comptage du tiroir puis clôture définitive. */}
      {!closure && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs print:hidden">
          <div>
            <p className="font-display text-lg font-semibold">Clôturer la journée</p>
            <p className="text-sm text-muted-foreground">
              Comptez le tiroir, puis figez le Z. Les chiffres seront archivés tels quels.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="counted-cash">Espèces comptées dans le tiroir</Label>
            <Input
              id="counted-cash"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              placeholder="0"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              className="tabular-nums"
            />
          </div>

          {liveDifference !== null && (
            <p className={cn(
              'rounded-xl px-3 py-2.5 text-sm font-medium',
              liveDifference === 0 ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning',
            )}>
              {liveDifference === 0
                ? '✅ Caisse juste — aucun écart.'
                : `Écart : ${differenceText(liveDifference)} par rapport aux ${formatFcfa(summary.cashTotal)} attendus.`}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="closure-note">Note (facultatif)</Label>
            <Textarea
              id="closure-note"
              rows={2}
              placeholder="Ex. billet abîmé, avance sur salaire…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="button" size="lg" className="min-h-11" onClick={() => { setError(null); setConfirmOpen(true) }}>
            <Lock className="size-4" />
            Clôturer la journée
          </Button>
        </div>
      )}

      {/* Journée clôturée : comptage, écart et note figés — visibles aussi sur le papier. */}
      {closure && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-xs print:border-black/20 print:shadow-none">
          <p className="font-display text-lg font-semibold">Comptage du tiroir</p>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Espèces comptées</span>
            <span className="font-medium tabular-nums">
              {closure.countedCash === null ? 'non compté' : formatFcfa(closure.countedCash)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Écart</span>
            <span className={cn(
              'font-medium tabular-nums',
              closure.difference === null ? 'text-muted-foreground'
                : closure.difference === 0 ? 'text-success' : 'text-warning',
            )}>
              {closure.difference === null ? '—'
                : closure.difference === 0 ? 'aucun écart' : differenceText(closure.difference)}
            </span>
          </div>
          {closure.note && (
            <p className="rounded-xl bg-muted p-3 text-sm text-foreground print:bg-transparent print:p-0">
              {closure.note}
            </p>
          )}
          {error && <p className="text-sm text-destructive print:hidden">{error}</p>}
          {isTodayView && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start text-muted-foreground print:hidden"
              onClick={() => { setError(null); setReopenOpen(true) }}
            >
              <LockOpen className="size-4" />
              Rouvrir la clôture
            </Button>
          )}
        </div>
      )}

      <div className="print:hidden">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
          <a href={`/api/export/commandes?from=${day}&to=${day}`}>
            <Download className="size-4" />
            Exporter les commandes du jour (CSV)
          </a>
        </Button>
      </div>

      {/* Historique des Z : chaque ligne rouvre la journée correspondante (chiffres figés). */}
      {history.length > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-xs print:hidden">
          <p className="font-display text-lg font-semibold">Z précédents</p>
          <ul className="flex flex-col gap-1">
            {history.map((h) => (
              <li key={h.closureNumber}>
                <Link
                  href={dayHref(h.day)}
                  className={cn(
                    'flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-accent',
                    h.day === day && 'bg-accent',
                  )}
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Badge variant="secondary">Z n°{h.closureNumber}</Badge>
                    <span className="capitalize text-muted-foreground">{formatDayLabel(h.day)}</span>
                  </span>
                  <span className="flex items-center gap-2 text-sm tabular-nums">
                    <span className="font-medium">{formatFcfa(h.cashTotal + h.airtelTotal)}</span>
                    {h.difference !== null && h.difference !== 0 && (
                      <Badge variant="warning">{differenceText(h.difference)}</Badge>
                    )}
                    {h.difference === 0 && <Badge variant="success">juste</Badge>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => { if (!open) setConfirmOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Clôturer la journée ?</DialogTitle>
            <DialogDescription>
              Cette clôture sera définitive. Les chiffres du jour seront archivés tels quels et ne
              changeront plus, même si une commande est modifiée ensuite.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Revenir</Button>
            </DialogClose>
            <Button type="button" disabled={pending} onClick={submitClosure}>
              {pending ? 'Clôture…' : 'Clôturer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reopenOpen} onOpenChange={(open) => { if (!open) setReopenOpen(false) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rouvrir la clôture du jour ?</DialogTitle>
            <DialogDescription>
              Le Z sera supprimé et la journée redeviendra modifiable. Seule la clôture
              d’aujourd’hui peut être rouverte.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="gap-2 sm:gap-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">Revenir</Button>
            </DialogClose>
            <Button type="button" variant="destructive" disabled={pending} onClick={submitReopen}>
              {pending ? 'Réouverture…' : 'Rouvrir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
