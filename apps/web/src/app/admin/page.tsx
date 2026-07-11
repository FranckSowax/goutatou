import { Activity, Radio, ShoppingBag, Store, type LucideIcon } from 'lucide-react'
import { createAdminClient } from '@/lib/supabase/admin'
import { dailySeries, planSplit } from '@/lib/stats'
import { AreaChart } from '@/components/charts/AreaChart'
import { HBarList } from '@/components/charts/HBarList'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

interface AdminOrderRow {
  status: string
  total: number
  created_at: string
  restaurant_id: string
}

interface AdminCampaignRow {
  restaurant_id: string
  status: string
  sent_count: number
  created_at: string
}

interface AdminStatusRow {
  restaurant_id: string
  state: string
  created_at: string
}

const TILE_TINTS = {
  mint: 'bg-tint-mint',
  peach: 'bg-tint-peach',
  sky: 'bg-tint-sky',
  rose: 'bg-tint-rose',
} as const

/** Tuile KPI pastel du dashboard admin (même langage visuel que KpiCard de /app). */
function DashboardTile({
  tint,
  icon: Icon,
  label,
  value,
}: {
  tint: keyof typeof TILE_TINTS
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className={cn('flex flex-col gap-3 rounded-2xl p-4 shadow-xs', TILE_TINTS[tint])}>
      <span className="flex size-9 items-center justify-center rounded-xl bg-card shadow-xs" aria-hidden="true">
        <Icon className="size-4.5 text-foreground/70" />
      </span>
      <div>
        <p className="font-display text-2xl font-bold tracking-tight text-foreground">{value}</p>
        <p className="mt-0.5 text-sm font-medium text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}

export default async function AdminPage() {
  const admin = createAdminClient()

  const now = new Date()
  const since7 = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString()
  const since14 = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString()
  const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString()

  const [{ data: restos }, { data: ordersRaw }, { data: campaignsRaw }, { data: statusesRaw }] =
    await Promise.all([
      admin
        .from('restaurants')
        .select('id, slug, name, created_at, whapi_channels(status), subscriptions(plan)')
        .order('created_at', { ascending: false }),
      admin
        .from('orders')
        .select('status, total, created_at, restaurant_id')
        .gte('created_at', since14),
      admin
        .from('campaigns')
        .select('restaurant_id, status, sent_count, created_at')
        .gte('created_at', since30),
      admin
        .from('statuses')
        .select('restaurant_id, state, created_at')
        .gte('created_at', since30),
    ])

  const restosList = restos ?? []
  const orders: AdminOrderRow[] = ordersRaw ?? []
  const campaigns: AdminCampaignRow[] = campaignsRaw ?? []
  const statuses: AdminStatusRow[] = statusesRaw ?? []

  // Restos onboardés + canaux actifs/total — dérivés de la requête restaurants déjà présente.
  const totalRestos = restosList.length
  const canauxActifs = restosList.filter((r) => {
    const chan = r.whapi_channels as unknown as { status: string } | null
    return chan?.status === 'active'
  }).length

  // Actifs (7 j) : restaurant_id distincts avec ≥1 commande non annulée sur les 7 derniers jours.
  const actifs7j = new Set(
    orders.filter((o) => o.status !== 'annulee' && o.created_at >= since7).map((o) => o.restaurant_id)
  ).size

  // Commandes/jour (14 j) global — dernière entrée = aujourd'hui (TZ Libreville, cf. lib/stats).
  const series14 = dailySeries(orders, 14, now)
  const commandesAujourdhui = series14[series14.length - 1]?.count ?? 0

  const plans = planSplit(
    restosList.map((r) => ({
      plan: (r.subscriptions as unknown as { plan: string } | null)?.plan ?? 'starter',
    }))
  )

  // Activité premium (30 j) : restos non-starter, usage campagnes + statuts.
  const premiumRows = restosList
    .filter((r) => {
      const sub = r.subscriptions as unknown as { plan: string } | null
      return (sub?.plan ?? 'starter') !== 'starter'
    })
    .map((r) => {
      const campagnesEnvoyees = campaigns
        .filter((c) => c.restaurant_id === r.id && c.status === 'sent')
        .reduce((sum, c) => sum + (c.sent_count ?? 0), 0)
      const statutsPublies = statuses.filter((s) => s.restaurant_id === r.id && s.state === 'posted').length
      return { id: r.id as string, name: r.name as string, campagnesEnvoyees, statutsPublies }
    })
    .sort((a, b) => b.campagnesEnvoyees + b.statutsPublies - (a.campagnesEnvoyees + a.statutsPublies))

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8">
      <section className="flex flex-col gap-4">
        <h2 className="font-display text-lg font-semibold">Vue d&apos;ensemble</h2>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <DashboardTile tint="mint" icon={Store} label="Restos onboardés" value={String(totalRestos)} />
          <DashboardTile tint="sky" icon={Activity} label="Actifs (7 j)" value={String(actifs7j)} />
          <DashboardTile
            tint="peach"
            icon={ShoppingBag}
            label="Commandes aujourd&apos;hui"
            value={String(commandesAujourdhui)}
          />
          <DashboardTile
            tint="rose"
            icon={Radio}
            label="Canaux actifs"
            value={`${canauxActifs} / ${totalRestos}`}
          />
          <div className="col-span-2 flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 shadow-xs sm:col-span-1">
            <p className="text-sm font-medium text-muted-foreground">Plans</p>
            <HBarList
              data={plans.map((p) => ({ label: p.plan.charAt(0).toUpperCase() + p.plan.slice(1), value: p.count }))}
              ariaLabel="Répartition des restaurants par plan"
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h3 className="font-display text-lg font-semibold">Commandes par jour (14 j)</h3>
          <AreaChart
            data={series14.map((d) => ({ label: d.label, value: d.count }))}
            ariaLabel="Commandes par jour, tous restaurants, 14 derniers jours"
          />
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-xs">
          <h3 className="font-display text-lg font-semibold">Activité premium (30 j)</h3>
          {premiumRows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              Aucun resto Pro/Premium actif pour l&apos;instant.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {premiumRows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                  <span className="font-medium">{r.name}</span>
                  <span className="flex gap-4 text-muted-foreground tabular-nums">
                    <span>
                      {r.campagnesEnvoyees} campagne{r.campagnesEnvoyees > 1 ? 's' : ''} envoyée
                      {r.campagnesEnvoyees > 1 ? 's' : ''}
                    </span>
                    <span>
                      {r.statutsPublies} statut{r.statutsPublies > 1 ? 's' : ''} publié
                      {r.statutsPublies > 1 ? 's' : ''}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
