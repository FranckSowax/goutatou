import { createSupabaseServer } from '@/lib/supabase/server'
import { isPro, isPremium } from '@/lib/premium'
import { Card } from '@/components/ui/card'
import { Board } from './board'
import { AutoStatusCard, type AutoStatusDish } from './auto-status-card'

export const dynamic = 'force-dynamic'

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServer>>

interface MenuCategoryRow {
  position: number
  menu_items: {
    id: string
    name: string
    price: number
    photo_url: string | null
    available: boolean
  }[]
}

/**
 * Prochains plats du cycle « Statuts Auto » : plats DISPONIBLES AVEC PHOTO,
 * dans l'ordre du menu (catégorie puis position — même ordre que
 * getBotContext côté bot, cf. services/whatsapp/src/repo.ts), en rotation à
 * partir du cursor sur `count` éléments (avec repli si le catalogue est plus
 * court que le quota).
 */
async function loadNextAutoStatusDishes(
  supabase: SupabaseServer,
  restaurantId: string,
  cursor: number,
  count: number,
): Promise<AutoStatusDish[]> {
  const { data } = await supabase
    .from('menu_categories')
    .select('position, menu_items(id, name, price, photo_url, available, position)')
    .eq('restaurant_id', restaurantId)
    .order('position')
    .order('position', { foreignTable: 'menu_items' })

  const dishes: AutoStatusDish[] = ((data ?? []) as unknown as MenuCategoryRow[]).flatMap((c) =>
    (c.menu_items ?? [])
      .filter((i) => i.available && !!i.photo_url)
      .map((i) => ({ id: i.id, name: i.name, price: i.price, photoUrl: i.photo_url as string })),
  )
  if (dishes.length === 0) return []

  const n = Math.min(count, dishes.length)
  const start = ((cursor % dishes.length) + dishes.length) % dishes.length
  return Array.from({ length: n }, (_, i) => dishes[(start + i) % dishes.length])
}

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

  const { data: restaurant } = await supabase.from('restaurants')
    .select('auto_status_enabled, auto_status_times, auto_status_count, auto_status_cursor, auto_status_last_slot')
    .eq('id', restaurantId)
    .single()

  const autoStatusCount = restaurant?.auto_status_count ?? 1
  const nextDishes = premium
    ? await loadNextAutoStatusDishes(supabase, restaurantId, restaurant?.auto_status_cursor ?? 0, autoStatusCount)
    : []

  return (
    <>
      <Board initial={statuses ?? []} restaurantId={restaurantId} isPremium={premium} />
      <div className="mx-auto max-w-3xl px-6 pb-8">
        <AutoStatusCard
          isPremium={premium}
          enabled={restaurant?.auto_status_enabled ?? false}
          times={((restaurant?.auto_status_times as string[] | null) ?? [])}
          count={autoStatusCount}
          lastSlot={restaurant?.auto_status_last_slot ?? null}
          nextDishes={nextDishes}
        />
      </div>
    </>
  )
}
