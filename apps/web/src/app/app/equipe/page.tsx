import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'
import { getTeam } from './team-data'
import { TeamView } from './team-view'

export const dynamic = 'force-dynamic'

export default async function EquipePage() {
  const supabase = await createSupabaseServer()
  const owner = await requireOwnerPage(supabase)
  const team = await getTeam(supabase, owner.restaurantId)
  return <TeamView members={team} selfUserId={owner.userId} />
}
