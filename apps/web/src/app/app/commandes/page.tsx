import Link from 'next/link'
import { ChevronLeft, ChevronRight, Store } from 'lucide-react'
import { createSupabaseServer } from '@/lib/supabase/server'
import { getMember } from '@/lib/member'
import { Button } from '@/components/ui/button'
import type { OrderCard } from '@/lib/orders'
import { dayBoundsUtc, formatDayLabel, formatYmdLibreville, isValidYmd, shiftDay } from '@/lib/order-day'
import { Board } from './board'

export const dynamic = 'force-dynamic'

function dayHref(date: string, q: string | undefined): string {
  const params = new URLSearchParams({ date })
  if (q) params.set('q', q)
  return `/app/commandes?${params.toString()}`
}

export default async function CommandesPage({ searchParams }: { searchParams: Promise<{ q?: string; date?: string }> }) {
  const { q, date } = await searchParams
  const today = formatYmdLibreville(new Date())
  // Jour affiché : le paramètre s'il est valide et pas dans le futur, sinon aujourd'hui.
  const day = isValidYmd(date) && date <= today ? date : today
  const isTodayView = day === today
  const { startUtc, endUtc } = dayBoundsUtc(day)

  const supabase = await createSupabaseServer()
  // Tenant courant : sert uniquement à filtrer l'abonnement Realtime du board
  // (`restaurant_id=eq.<id>`) — la lecture ci-dessous est déjà cloisonnée par RLS.
  const member = await getMember(supabase)
  const { data } = await supabase
    .from('orders')
    .select(`id, order_number, status, mode, source, total, created_at, delivery_address,
             arrived_at, arrival_note, verified_at, payment_method, payment_status,
             customers(name, phone), drive_slots(label), order_items(name, qty, unit_price)`)
    .gte('created_at', startUtc)
    .lt('created_at', endUtc)
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
      payment_method: o.payment_method, payment_status: o.payment_status,
      items: (o.order_items as { name: string; qty: number; unit_price: number }[]) ?? [],
    }
  })

  const prevDay = shiftDay(day, -1)
  const nextDay = shiftDay(day, 1)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Commandes</h1>
        <Button asChild>
          <Link href="/app/commandes/sur-place">
            <Store className="size-4" />
            Sur Place
          </Link>
        </Button>
      </div>

      {/* Navigation par jour : flèche pour remonter aux jours précédents (toutes les commandes passées) */}
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="icon" aria-label="Jour précédent">
          <Link href={dayHref(prevDay, q)}><ChevronLeft className="size-4" /></Link>
        </Button>
        {isTodayView ? (
          <Button variant="outline" size="icon" disabled aria-label="Jour suivant">
            <ChevronRight className="size-4" />
          </Button>
        ) : (
          <Button asChild variant="outline" size="icon" aria-label="Jour suivant">
            <Link href={dayHref(nextDay, q)}><ChevronRight className="size-4" /></Link>
          </Button>
        )}
        <span className="text-sm font-medium capitalize">
          {formatDayLabel(day)}
          {isTodayView && <span className="ml-1 text-muted-foreground">· aujourd’hui</span>}
        </span>
        {!isTodayView && (
          <Button asChild variant="ghost" size="sm" className="ml-1">
            <Link href={dayHref(today, q)}>Aujourd’hui</Link>
          </Button>
        )}

        {/* Saut direct à une date : `<input type="date">` natif (sélecteur système sur mobile),
            dans un simple formulaire GET — même paramètre d'URL `date` que les flèches, aucun
            JavaScript requis. `max` = aujourd'hui au fuseau du resto (cf. lib/order-day.ts). */}
        <form method="get" action="/app/commandes" className="flex items-center gap-2">
          {q && <input type="hidden" name="q" value={q} />}
          <label htmlFor="jour" className="sr-only">Aller à une date</label>
          <input
            id="jour"
            type="date"
            name="date"
            defaultValue={day}
            max={today}
            className="h-11 rounded-lg border border-border bg-card px-3 text-sm text-foreground shadow-xs focus-visible:outline-2 focus-visible:outline-primary sm:h-9"
          />
          <Button type="submit" variant="outline" size="sm">Aller</Button>
        </form>
      </div>

      <Board
        key={`${day}-${q ?? ''}`}
        initialOrders={orders}
        initialQuery={q ?? ''}
        isTodayView={isTodayView}
        restaurantId={member?.restaurantId}
      />
    </div>
  )
}
