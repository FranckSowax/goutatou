import { formatFcfa } from '@goutatou/db/types'
import { createSupabaseServer } from '@/lib/supabase/server'
import {
  cancelRate,
  dailySeries,
  hourHistogram,
  modeSplit,
  newVsReturning,
  pctDelta,
  sourceSplit,
  topItems,
  weekdayCa,
} from '@/lib/stats'
import { AreaChart } from '@/components/charts/AreaChart'
import { BarChart } from '@/components/charts/BarChart'
import { HBarList } from '@/components/charts/HBarList'
import { KpiCard } from '../home-cards'
import { PeriodSelector } from './period-selector'

export const dynamic = 'force-dynamic'

interface StatsOrderRow {
  customer_id: string
  source: string
  status: string
  mode: string
  total: number
  created_at: string
}

const VALID_PERIODS = [7, 30, 90] as const
type Period = (typeof VALID_PERIODS)[number]

function parsePeriod(raw: string | undefined): Period {
  const n = Number(raw)
  return (VALID_PERIODS as readonly number[]).includes(n) ? (n as Period) : 30
}

/** Somme CA/nb commandes hors annulées sur un tableau déjà filtré à la fenêtre voulue. */
function sumCaCount(orders: { status: string; total: number }[]): { ca: number; count: number } {
  let ca = 0
  let count = 0
  for (const o of orders) {
    if (o.status === 'annulee') continue
    ca += o.total
    count += 1
  }
  return { ca, count }
}

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const { p: pParam } = await searchParams
  const period = parsePeriod(pParam)

  const supabase = await createSupabaseServer()
  const { data: member } = await supabase
    .from('restaurant_members')
    .select('restaurant_id')
    .limit(1)
    .maybeSingle()

  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }

  const now = new Date()
  const sinceCurrent = new Date(now.getTime() - period * 24 * 3600 * 1000).toISOString()
  const sincePrevious = new Date(now.getTime() - 2 * period * 24 * 3600 * 1000).toISOString()

  const [{ data: ordersRaw }, { data: customersRaw }, { data: itemsRaw }] = await Promise.all([
    // Fenêtre = 2 × période, pour pouvoir comparer la période courante à la précédente.
    supabase
      .from('orders')
      .select('customer_id, source, status, mode, total, created_at')
      .gte('created_at', sincePrevious)
      .order('created_at', { ascending: false }),
    supabase.from('customers').select('id, created_at'),
    // Embed inner + filtres sur la table jointe (syntaxe PostgREST : `.gte('orders.created_at', …)`
    // et `.neq('orders.status', …)` ciblent la ressource `orders!inner`, pas order_items elle-même).
    supabase
      .from('order_items')
      .select('name, qty, unit_price, orders!inner(status, created_at)')
      .gte('orders.created_at', sinceCurrent)
      .neq('orders.status', 'annulee'),
  ])

  const allOrders: StatsOrderRow[] = ordersRaw ?? []
  const customers = customersRaw ?? []
  const items = (itemsRaw ?? []).map((it) => ({
    name: it.name as string,
    qty: it.qty as number,
    unit_price: it.unit_price as number,
  }))

  const ordersCurrent = allOrders.filter((o) => o.created_at >= sinceCurrent)
  const ordersPrevious = allOrders.filter((o) => o.created_at >= sincePrevious && o.created_at < sinceCurrent)

  const { ca: caCurrent, count: countCurrent } = sumCaCount(ordersCurrent)
  const { ca: caPrevious, count: countPrevious } = sumCaCount(ordersPrevious)
  const panierMoyenCurrent = countCurrent > 0 ? Math.round(caCurrent / countCurrent) : 0
  const panierMoyenPrevious = countPrevious > 0 ? Math.round(caPrevious / countPrevious) : 0

  const nvrCurrent = newVsReturning(ordersCurrent, customers, sinceCurrent)
  const nvrPrevious = newVsReturning(ordersPrevious, customers, sincePrevious)

  const cancelRateCurrent = cancelRate(ordersCurrent)
  const cancelRatePrevious = cancelRate(ordersPrevious)

  const series = dailySeries(ordersCurrent, period, now)
  const weekday = weekdayCa(ordersCurrent, now, period)
  const top5 = topItems(items, 5)
  const modes = modeSplit(ordersCurrent)
  const hours = hourHistogram(ordersCurrent)
  const sources = sourceSplit(ordersCurrent)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold">Statistiques</h1>
        <PeriodSelector active={period} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          tint="mint"
          label={`CA (${period} jours)`}
          value={formatFcfa(caCurrent)}
          delta={pctDelta(caCurrent, caPrevious)}
        />
        <KpiCard
          tint="sky"
          label={`Commandes (${period} jours)`}
          value={String(countCurrent)}
          delta={pctDelta(countCurrent, countPrevious)}
        />
        <KpiCard
          tint="peach"
          label="Panier moyen"
          value={formatFcfa(panierMoyenCurrent)}
          delta={pctDelta(panierMoyenCurrent, panierMoyenPrevious)}
        />
        <KpiCard
          tint="rose"
          label="Nouveaux clients"
          value={String(nvrCurrent.nouveaux)}
          delta={pctDelta(nvrCurrent.nouveaux, nvrPrevious.nouveaux)}
        />
        <KpiCard
          tint="mint"
          label="Taux d'annulation"
          value={`${cancelRateCurrent} %`}
          delta={pctDelta(cancelRateCurrent, cancelRatePrevious)}
          invert
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">Chiffre d&apos;affaires ({period} jours)</h2>
          <AreaChart
            data={series.map((d) => ({ label: d.label, value: d.ca }))}
            height={120}
            valueFormat={formatFcfa}
            ariaLabel={`Chiffre d'affaires des ${period} derniers jours`}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">Commandes ({period} jours)</h2>
          <BarChart
            data={series.map((d) => ({ label: d.label, value: d.count }))}
            height={120}
            ariaLabel={`Nombre de commandes des ${period} derniers jours`}
          />
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">CA par jour de semaine ({period} jours)</h2>
          <BarChart
            data={weekday.map((d) => ({ label: d.label, value: d.ca }))}
            valueFormat={formatFcfa}
            ariaLabel="Chiffre d'affaires cumulé par jour de semaine"
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">Heures de pointe ({period} jours)</h2>
          <BarChart
            data={hours.map((h) => ({ label: `${h.hour}h`, value: h.count }))}
            ariaLabel="Répartition des commandes par heure"
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">Top 5 plats ({period} jours)</h2>
          <HBarList
            data={top5.map((it) => ({
              label: it.name,
              value: it.qty,
              display: `${it.qty} × · ${formatFcfa(it.ca)}`,
            }))}
            ariaLabel="Top 5 des plats les plus vendus"
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">Répartition par mode ({period} jours)</h2>
          <HBarList
            data={modes.map((m) => ({ label: m.label, value: m.count }))}
            ariaLabel="Répartition des commandes par mode"
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">Nouveaux vs récurrents ({period} jours)</h2>
          <HBarList
            data={[
              { label: 'Nouveaux', value: nvrCurrent.nouveaux },
              { label: 'Récurrents', value: nvrCurrent.recurrents },
            ]}
            ariaLabel="Nouveaux clients vs clients récurrents"
          />
        </section>

        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">Source des commandes ({period} jours)</h2>
          <HBarList
            data={sources.map((s) => ({ label: s.label, value: s.count }))}
            ariaLabel="Répartition des commandes par source"
          />
        </section>
      </div>
    </div>
  )
}
