import { createSupabaseServer } from '@/lib/supabase/server'
import { requireOwnerPage } from '@/lib/roles'
import { isPro, isPremium } from '@/lib/premium'
import { PageTabs } from '@/components/page-tabs'
import { MarketingFrame } from '../_components/marketing-frame'
import { Composer } from './composer'
import { Board } from './board'
import { AutoStatusCard, type AutoStatusDish } from './auto-status-card'
import { isAutoStatusValidationMode } from './shared'

export const dynamic = 'force-dynamic'

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseServer>>

const STATUTS_TABS = ['composer', 'auto', 'historique'] as const
type StatutsTab = (typeof STATUTS_TABS)[number]

function parseTab(raw: string | undefined): StatutsTab {
  return (STATUTS_TABS as readonly string[]).includes(raw ?? '') ? (raw as StatutsTab) : 'composer'
}

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

export default async function StatutsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab: tabParam } = await searchParams
  const tab = parseTab(tabParam)

  const supabase = await createSupabaseServer()
  await requireOwnerPage(supabase)
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  const pro = member ? await isPro(supabase, member.restaurant_id) : false
  if (!member || !pro) {
    return (
      <MarketingFrame title="Statuts WhatsApp">
        <div className="rounded-2xl border border-primary/30 bg-accent p-6 text-center">
          <p className="font-display text-xl font-semibold text-accent-foreground">Fonctionnalité Pro</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Fonctionnalité de l’offre <strong>Pro</strong>. Contactez Goutatou pour l’activer.
          </p>
        </div>
      </MarketingFrame>
    )
  }
  const restaurantId = member.restaurant_id as string
  const premium = await isPremium(supabase, restaurantId)
  // Historique borné côté serveur : le Board pagine de toute façon côté client, inutile de charger
  // tout l'historique du resto à chaque affichage.
  const { data: statuses } = await supabase.from('statuses')
    .select('id, kind, content, media_url, bg_color, caption_color, font_type, audience, state, scheduled_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: restaurant } = await supabase.from('restaurants')
    .select('auto_status_enabled, auto_status_times, auto_status_count, auto_status_cursor, auto_status_last_slot, auto_status_validation, auto_status_manager_phone, contact_phone, staff_group_id, auto_status_echo_channel')
    .eq('id', restaurantId)
    .single()

  const autoStatusCount = restaurant?.auto_status_count ?? 1
  const nextDishes = premium
    ? await loadNextAutoStatusDishes(supabase, restaurantId, restaurant?.auto_status_cursor ?? 0, autoStatusCount)
    : []

  return (
    <MarketingFrame
      title="Statuts WhatsApp"
      description="Publiez vos statuts WhatsApp et automatisez leur diffusion."
    >
      {/* Sous-onglets de la page (pills), distincts de la nav de section
          `MarketingTabs` (soulignée) affichée juste au-dessus par le layout. */}
      <PageTabs
        tabs={[
          { value: 'composer', label: 'Nouveau statut' },
          { value: 'auto', label: 'Auto 👑' },
          { value: 'historique', label: 'Historique' },
        ]}
        active={tab}
        variant="pills"
      />

      {tab === 'composer' && <Composer restaurantId={restaurantId} isPremium={premium} />}

      {tab === 'auto' && (
        <AutoStatusCard
          isPremium={premium}
          enabled={restaurant?.auto_status_enabled ?? false}
          times={((restaurant?.auto_status_times as string[] | null) ?? [])}
          count={autoStatusCount}
          lastSlot={restaurant?.auto_status_last_slot ?? null}
          nextDishes={nextDishes}
          validation={
            isAutoStatusValidationMode(String(restaurant?.auto_status_validation ?? 'none'))
              ? (restaurant?.auto_status_validation as 'none' | 'manager' | 'group')
              : 'none'
          }
          managerPhone={restaurant?.auto_status_manager_phone ?? null}
          contactPhone={restaurant?.contact_phone ?? null}
          staffGroupId={restaurant?.staff_group_id ?? null}
          echoChannel={restaurant?.auto_status_echo_channel ?? false}
        />
      )}

      {tab === 'historique' && <Board initial={statuses ?? []} />}
    </MarketingFrame>
  )
}
