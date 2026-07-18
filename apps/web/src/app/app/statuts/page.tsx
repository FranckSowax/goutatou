import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'

export default async function StatutsRedirectPage() {
  const supabase = await createSupabaseServer()
  await requireOwnerPage(supabase)
  redirect('/app/marketing/statuts')
}
