import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig, type LpConfig } from './config'

export interface LpMenuItem {
  id: string
  name: string
  description: string | null
  price: number
  photoUrl: string | null
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
}

// Mémoïsé par requête (React cache) : layout, page et generateMetadata appellent
// tous getLpData(slug) — sans cache ça ferait 3× les requêtes par rendu.
export const getLpData = cache(async (slug: string): Promise<LpData | null> => {
  const db = createAdminClient()
  const { data: resto } = await db
    .from('restaurants')
    .select('id, slug, name, lp_config, drive_enabled, whapi_channels(phone)')
    .eq('slug', slug)
    .maybeSingle()
  if (!resto) return null

  const config = parseLpConfig(resto.lp_config, resto.name)
  if (!config.published) return null

  const [{ data: cats }, { data: slots }] = await Promise.all([
    db.from('menu_categories')
      .select('id, name, position, menu_items(id, name, description, price, photo_url, available, position)')
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
    }[]) ?? [])
      .filter((i) => i.available)
      .sort((a, b) => a.position - b.position)
      .map((i) => ({ id: i.id, name: i.name, description: i.description, price: i.price, photoUrl: i.photo_url })),
  })).filter((c) => c.items.length > 0)

  const allItems = categories.flatMap((c) => c.items)
  const featured = config.featuredIds
    .map((id) => allItems.find((i) => i.id === id))
    .filter((i): i is LpMenuItem => Boolean(i))
    .slice(0, 4)

  const channel = resto.whapi_channels as unknown as { phone: string | null } | null

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
  }
})
