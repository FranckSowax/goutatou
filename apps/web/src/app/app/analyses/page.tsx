import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'
import { isPremium } from '@/lib/premium'
import { getAnalyses } from './analyses-data'
import type { AnalysisPeriod } from './analyses-data'
import { AnalysesView } from './analyses-view'

export const dynamic = 'force-dynamic'

const VALID_PERIODS: AnalysisPeriod[] = ['day', 'week', 'month']

function parsePeriod(raw: string | undefined): AnalysisPeriod {
  return VALID_PERIODS.includes(raw as AnalysisPeriod) ? (raw as AnalysisPeriod) : 'week'
}

export default async function AnalysesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>
}) {
  const { period: periodParam } = await searchParams
  const period = parsePeriod(periodParam)

  const supabase = await createSupabaseServer()
  await requireOwnerPage(supabase)
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

  if (!(await isPremium(supabase, member.restaurant_id))) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-display text-2xl font-semibold">Analyses</h1>
        <div className="rounded-2xl border border-primary/30 bg-accent p-6 text-center">
          <h2 className="font-display text-lg font-semibold text-foreground">
            Fonctionnalité Premium
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Les analyses IA et les indicateurs comparés (commandes, conversations, taux de conversion,
            recommandations marketing) sont réservés à l&apos;offre Premium.
          </p>
        </div>
      </div>
    )
  }

  const { kpis, previous, aiReport } = await getAnalyses(supabase, member.restaurant_id, period)

  return <AnalysesView kpis={kpis} previous={previous} aiReport={aiReport} period={period} />
}
