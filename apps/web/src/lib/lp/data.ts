import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig, type LpConfig } from './config'

export interface LpSupplement {
  id: string
  name: string
  price: number
}

export interface LpMenuItem {
  id: string
  name: string
  description: string | null
  price: number
  photoUrl: string | null
  supplements: LpSupplement[]
}

export interface LpData {
  restaurantId: string
  slug: string
  name: string
  config: LpConfig
  categories: { id: string; name: string; items: LpMenuItem[] }[]
  featured: LpMenuItem[]
  driveSlots: { id: string; label: string }[]
  driveEnabled: boolean
  whatsappPhone: string | null
  isPremium: boolean
  /** Id du pixel Meta du resto (public par nature) — null si non configuré. */
  metaPixelId: string | null
}

// Mémoïsé par requête (React cache) : layout, page et generateMetadata appellent
// tous getLpData(slug) — sans cache ça ferait 3× les requêtes par rendu.
export const getLpData = cache(async (slug: string): Promise<LpData | null> => {
  const db = createAdminClient()
  const { data: resto } = await db
    .from('restaurants')
    .select('id, slug, name, lp_config, drive_enabled, meta_pixel_id, whapi_channels(phone), subscriptions(plan, status)')
    .eq('slug', slug)
    .maybeSingle()
  if (!resto) return null

  const config = parseLpConfig(resto.lp_config, resto.name)
  if (!config.published) return null

  const [{ data: cats }, { data: slots }] = await Promise.all([
    db.from('menu_categories')
      .select('id, name, position, menu_items(id, name, description, price, photo_url, available, position, menu_supplements(id, name, price, available, position))')
      .eq('restaurant_id', resto.id)
      .order('position'),
    db.from('drive_slots').select('id, label, position')
      .eq('restaurant_id', resto.id).eq('active', true).order('position'),
  ])

  const categories = (cats ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    items: ((c.menu_items as {
      id: string; name: string; description: string | null; price: number
      photo_url: string | null; available: boolean; position: number
      menu_supplements: { id: string; name: string; price: number; available: boolean; position: number }[] | null
    }[]) ?? [])
      .filter((i) => i.available)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({
        id: i.id, name: i.name, description: i.description, price: i.price, photoUrl: i.photo_url,
        supplements: (i.menu_supplements ?? [])
          .filter((s) => s.available)
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ id: s.id, name: s.name, price: s.price })),
      })),
  })).filter((c) => c.items.length > 0)

  const allItems = categories.flatMap((c) => c.items)
  const featured = config.featuredIds
    .map((id) => allItems.find((i) => i.id === id))
    .filter((i): i is LpMenuItem => Boolean(i))
    .slice(0, 4)

  const channel = resto.whapi_channels as unknown as { phone: string | null } | null
  // Même définition que lib/premium.ts (isPremium) : plan 'premium' ET status 'active'.
  const sub = resto.subscriptions as unknown as { plan: string; status: string } | null
  const isPremium = sub?.plan === 'premium' && sub?.status === 'active'

  return {
    restaurantId: resto.id,
    slug: resto.slug,
    name: resto.name,
    config,
    categories,
    featured: featured.length ? featured : allItems.slice(0, 3),
    driveSlots: (slots ?? []).map((s) => ({ id: s.id, label: s.label })),
    driveEnabled: resto.drive_enabled,
    whatsappPhone: channel?.phone ?? config.whatsappPhone,
    isPremium,
    metaPixelId: (resto.meta_pixel_id as string | null) ?? null,
  }
})
