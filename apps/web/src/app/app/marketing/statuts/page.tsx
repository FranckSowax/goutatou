import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro, isPremium } from '@/lib/premium'
import { Card } from '@/components/ui/card'
import { Board } from './board'

export const dynamic = 'force-dynamic'

export default async function StatutsPage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const pro = member ? await isPro(supabase, member.restaurant_id) : false
  if (!member || !pro) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <h1 className="mb-6 font-display text-2xl font-semibold">Statuts WhatsApp</h1>
        <Card className="rounded-2xl border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Pro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.
          </p>
        </Card>
      </div>
    )
  }
  const restaurantId = member.restaurant_id as string
  const premium = await isPremium(supabase, restaurantId)
  const { data: statuses } = await supabase.from('statuses')
    .select('id, kind, content, media_url, bg_color, caption_color, font_type, audience, state, scheduled_at, created_at')
    .order('created_at', { ascending: false })
  return <Board initial={statuses ?? []} restaurantId={restaurantId} isPremium={premium} />
}
