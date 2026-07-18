import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'
import { getMarketingKpis } from './hub-data'
import { MarketingHub } from './hub'

export const dynamic = 'force-dynamic'

export default async function MarketingPage() {
  const supabase = await createSupabaseServer()
  await requireOwnerPage(supabase)
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }
  const kpis = await getMarketingKpis(supabase, member.restaurant_id)
  return <MarketingHub kpis={kpis} />
}
