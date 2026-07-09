import Link from 'next/link'
import { createSupabaseServer } from '@/lib/supabase/server'
import { isPremium } from '@/lib/premium'
import { Board } from './board'

export const dynamic = 'force-dynamic'

export default async function CampagnesPage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const premium = member ? await isPremium(supabase, member.restaurant_id) : false
  if (!premium) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="text-2xl font-bold">Campagnes WhatsApp</h1>
        <p className="mt-4 opacity-70">Cette fonctionnalité est réservée au plan <strong>Premium</strong>. Contactez Goutatou pour l’activer.</p>
      </div>
    )
  }
  const { data: campaigns } = await supabase.from('campaigns')
    .select('id, name, status, total_recipients, sent_count, failed_count, created_at')
    .order('created_at', { ascending: false })
  return <Board initial={campaigns ?? []} />
}
