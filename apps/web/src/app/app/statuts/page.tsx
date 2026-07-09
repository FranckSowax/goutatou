import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro } from '@/lib/premium'
import { Board } from './board'

export const dynamic = 'force-dynamic'

export default async function StatutsPage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const pro = member ? await isPro(supabase, member.restaurant_id) : false
  if (!pro) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl font-bold">Statuts WhatsApp</h1>
        <p className="mt-4 opacity-70">Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.</p>
      </div>
    )
  }
  const { data: statuses } = await supabase.from('statuses')
    .select('id, kind, content, media_url, state, scheduled_at, created_at')
    .order('created_at', { ascending: false })
  return <Board initial={statuses ?? []} />
}
