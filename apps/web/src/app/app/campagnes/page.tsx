import { createSupabaseServer } from '@/lib/supabase/server'
import { isPremium } from '@/lib/premium'
import { Card } from '@/components/ui/card'
import { Board } from './board'

export const dynamic = 'force-dynamic'

export default async function CampagnesPage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const premium = member ? await isPremium(supabase, member.restaurant_id) : false
  if (!premium) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="mb-6 font-display text-2xl font-semibold">Campagnes WhatsApp</h1>
        <Card className="rounded-2xl border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Premium</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Cette fonctionnalité est réservée au plan <strong>Premium</strong>. Contactez Goutatou pour l’activer.
          </p>
        </Card>
      </div>
    )
  }
  const { data: campaigns } = await supabase.from('campaigns')
    .select('id, name, status, total_recipients, sent_count, failed_count, created_at')
    .order('created_at', { ascending: false })
  return <Board initial={campaigns ?? []} />
}
