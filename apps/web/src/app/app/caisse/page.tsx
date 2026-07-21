import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'
import { computeCashDay, type CashDay, type CashOrder } from '@/lib/cash'
import { dayBoundsUtc, formatYmdLibreville, isValidYmd } from '@/lib/order-day'
import { CashView, type ClosureDetail, type ClosureHistoryRow } from './cash-view'

export const dynamic = 'force-dynamic'

/** Ventilation figée relue depuis le jsonb : on ne garde que les valeurs numériques. */
function toBreakdown(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value)
    if (Number.isFinite(n)) out[key] = n
  }
  return out
}

export default async function CaissePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const supabase = await createSupabaseServer()
  const { restaurantId } = await requireOwnerPage(supabase)

  const today = formatYmdLibreville(new Date())
  // Jour affiché : le paramètre s'il est valide et pas dans le futur, sinon aujourd'hui.
  const { date } = await searchParams
  const day = isValidYmd(date) && date <= today ? date : today

  const [closureRes, historyRes, restaurantRes] = await Promise.all([
    supabase
      .from('cash_closures')
      .select(`closure_number, day, cash_total, airtel_total, pending_total, canceled_total,
               orders_count, canceled_count, by_mode, by_source, counted_cash, difference, note, closed_at`)
      .eq('restaurant_id', restaurantId)
      .eq('day', day)
      .maybeSingle(),
    supabase
      .from('cash_closures')
      .select('closure_number, day, cash_total, airtel_total, counted_cash, difference')
      .eq('restaurant_id', restaurantId)
      .order('day', { ascending: false })
      .limit(30),
    supabase.from('restaurants').select('name').eq('id', restaurantId).maybeSingle(),
  ])

  const row = closureRes.data

  // Journée clôturée → les chiffres viennent de la ligne FIGÉE, jamais d'un recalcul : c'est toute
  // la valeur du Z (rouvrir la page des mois plus tard doit redonner les chiffres du soir même).
  // Journée ouverte → on agrège les commandes du jour à la volée.
  let summary: CashDay
  if (row) {
    summary = {
      cashTotal: row.cash_total ?? 0,
      airtelTotal: row.airtel_total ?? 0,
      pendingTotal: row.pending_total ?? 0,
      canceledTotal: row.canceled_total ?? 0,
      ordersCount: row.orders_count ?? 0,
      canceledCount: row.canceled_count ?? 0,
      byMode: toBreakdown(row.by_mode),
      bySource: toBreakdown(row.by_source),
    }
  } else {
    const { startUtc, endUtc } = dayBoundsUtc(day)
    const { data: orders } = await supabase
      .from('orders')
      .select('total, status, mode, source, payment_method, payment_status')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', startUtc)
      .lt('created_at', endUtc)
    summary = computeCashDay((orders ?? []) as CashOrder[])
  }

  const closure: ClosureDetail | null = row
    ? {
        closureNumber: row.closure_number,
        closedAt: row.closed_at,
        countedCash: row.counted_cash,
        difference: row.difference,
        note: row.note,
      }
    : null

  const history: ClosureHistoryRow[] = (historyRes.data ?? []).map((h) => ({
    closureNumber: h.closure_number,
    day: h.day,
    cashTotal: h.cash_total ?? 0,
    airtelTotal: h.airtel_total ?? 0,
    countedCash: h.counted_cash,
    difference: h.difference,
  }))

  return (
    <CashView
      day={day}
      today={today}
      restaurantName={restaurantRes.data?.name ?? null}
      summary={summary}
      closure={closure}
      history={history}
    />
  )
}
