import { formatFcfa } from '@goutatou/db/types'
import { createSupabaseServer } from '@/lib/supabase/server'
import { dailySeries, topItems, modeSplit, hourHistogram } from '@/lib/stats'
import { AreaChart } from '@/components/charts/AreaChart'
import { BarChart } from '@/components/charts/BarChart'
import { HBarList } from '@/components/charts/HBarList'
import { KpiCard } from '../home-cards'

export const dynamic = 'force-dynamic'

interface StatsOrderRow {
  status: string
  mode: string
  total: number
  created_at: string
}

export default async function StatsPage() {
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
  const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()
  const since7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()

  const [{ data: ordersRaw }, { data: itemsRaw }] = await Promise.all([
    supabase
      .from('orders')
      .select('id, status, mode, total, created_at')
      .gte('created_at', since30)
      .order('created_at', { ascending: false }),
    // Embed inner + filtres sur la table jointe (syntaxe PostgREST : `.gte('orders.created_at', …)`
    // et `.neq('orders.status', …)` ciblent la ressource `orders!inner`, pas order_items elle-même).
    supabase
      .from('order_items')
      .select('name, qty, unit_price, orders!inner(status, created_at)')
      .gte('orders.created_at', since30)
      .neq('orders.status', 'annulee'),
  ])

  const orders: StatsOrderRow[] = ordersRaw ?? []
  const items = (itemsRaw ?? []).map((it) => ({
    name: it.name as string,
    qty: it.qty as number,
    unit_price: it.unit_price as number,
  }))

  const series30 = dailySeries(orders, 30, now)
  const ca30 = series30.reduce((sum, d) => sum + d.ca, 0)
  const count30 = series30.reduce((sum, d) => sum + d.count, 0)
  const panierMoyen30 = count30 > 0 ? Math.round(ca30 / count30) : 0

  const series14 = dailySeries(orders, 14, now)
  const top5 = topItems(items, 5)
  const modes = modeSplit(orders)
  const orders7 = orders.filter((o) => o.created_at >= since7)
  const hours = hourHistogram(orders7)

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">Statistiques</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard tint="mint" label="CA (30 jours)" value={formatFcfa(ca30)} />
        <KpiCard tint="sky" label="Commandes (30 jours)" value={String(count30)} />
        <KpiCard tint="peach" label="Panier moyen (30 jours)" value={formatFcfa(panierMoyen30)} />
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
        <h2 className="font-display text-lg font-semibold">Chiffre d&apos;affaires (14 jours)</h2>
        <AreaChart
          data={series14.map((d) => ({ label: d.label, value: d.ca }))}
          valueFormat={formatFcfa}
          ariaLabel="Chiffre d'affaires des 14 derniers jours"
        />
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
        <h2 className="font-display text-lg font-semibold">Commandes (14 jours)</h2>
        <BarChart
          data={series14.map((d) => ({ label: d.label, value: d.count }))}
          ariaLabel="Nombre de commandes des 14 derniers jours"
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h2 className="font-display text-lg font-semibold">Top 5 plats (30 jours)</h2>
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
          <h2 className="font-display text-lg font-semibold">Répartition par mode (30 jours)</h2>
          <HBarList
            data={modes.map((m) => ({ label: m.label, value: m.count }))}
            ariaLabel="Répartition des commandes par mode"
          />
        </section>
      </div>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
        <h2 className="font-display text-lg font-semibold">Heures de pointe (7 jours)</h2>
        <BarChart
          data={hours.map((h) => ({ label: `${h.hour}h`, value: h.count }))}
          ariaLabel="Répartition des commandes par heure"
        />
      </section>
    </div>
  )
}
