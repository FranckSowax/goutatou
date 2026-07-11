import { createSupabaseServer } from '@/lib/supabase/server'
import { CampaignForm } from './form'

export const dynamic = 'force-dynamic'

export default async function NouvelleCampagnePage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true })
    .eq('restaurant_id', member?.restaurant_id).eq('opted_out', false)
  return (
    <main className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 font-display text-2xl font-semibold">Nouvelle campagne</h1>
      <CampaignForm recipientCount={count ?? 0} />
    </main>
  )
}
