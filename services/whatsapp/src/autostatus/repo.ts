import type { SupabaseClient } from '@supabase/supabase-js'

/** Resto éligible aux statuts auto : premium actif + auto_status_enabled + canal WhatsApp actif. */
export interface AutoStatusCandidate {
  restaurantId: string
  autoStatusTimes: string[]
  autoStatusCount: number
  autoStatusCursor: number
  autoStatusLastSlot: string | null
}

/** Plat disponible AVEC photo, position stable (catégorie puis plat) — rotation cursor dessus. */
export interface AutoStatusDish {
  id: string
  name: string
  price: number
  photoUrl: string
}

export interface NewAutoStatusRow {
  restaurantId: string
  content: string
  mediaUrl: string
  scheduledAt: string
}

export interface AutoStatusRepo {
  listCandidates(): Promise<AutoStatusCandidate[]>
  /**
   * Claim conditionnel du créneau : n'écrit `auto_status_last_slot = slotKey` que si la valeur
   * actuelle en base est encore `previousLastSlot` (claim-first, cf. pattern catalog/repo.ts
   * claimSyncRequests). Renvoie `true` si le claim a réussi (ligne mise à jour).
   */
  claimSlot(restaurantId: string, slotKey: string, previousLastSlot: string | null): Promise<boolean>
  getPhotoDishes(restaurantId: string): Promise<AutoStatusDish[]>
  bumpCursor(restaurantId: string, nextCursor: number): Promise<void>
  insertGeneratedStatuses(rows: NewAutoStatusRow[]): Promise<void>
}

interface CandidateRow {
  id: string
  auto_status_times: string[] | null
  auto_status_count: number
  auto_status_cursor: number
  auto_status_last_slot: string | null
}

export function createAutoStatusRepo(db: SupabaseClient): AutoStatusRepo {
  return {
    async listCandidates() {
      // Jointures !inner : abonnement premium actif ET canal WhatsApp actif requis (filtres
      // appliqués côté PostgREST sur les tables embarquées, pattern catalog/repo.ts claimSyncRequests).
      const { data } = await db
        .from('restaurants')
        .select(
          'id, auto_status_times, auto_status_count, auto_status_cursor, auto_status_last_slot, ' +
            'subscriptions!inner(plan, status), whapi_channels!inner(status)',
        )
        .eq('auto_status_enabled', true)
        .eq('subscriptions.plan', 'premium')
        .eq('subscriptions.status', 'active')
        .eq('whapi_channels.status', 'active')
      const rows = (data ?? []) as unknown as CandidateRow[]
      return rows.map((r) => ({
        restaurantId: r.id,
        autoStatusTimes: r.auto_status_times ?? [],
        autoStatusCount: r.auto_status_count,
        autoStatusCursor: r.auto_status_cursor,
        autoStatusLastSlot: r.auto_status_last_slot,
      }))
    },

    async claimSlot(restaurantId, slotKey, previousLastSlot) {
      let query = db.from('restaurants').update({ auto_status_last_slot: slotKey }).eq('id', restaurantId)
      query = previousLastSlot === null ? query.is('auto_status_last_slot', null) : query.eq('auto_status_last_slot', previousLastSlot)
      const { data } = await query.select('id')
      return ((data ?? []) as { id: string }[]).length > 0
    },

    async getPhotoDishes(restaurantId) {
      const { data } = await db
        .from('menu_categories')
        .select('position, menu_items(id, name, price, photo_url, available, position)')
        .eq('restaurant_id', restaurantId)
        .order('position')
      const cats = (data ?? []) as unknown as {
        position: number
        menu_items: { id: string; name: string; price: number; photo_url: string | null; available: boolean; position: number }[] | null
      }[]
      const dishes: AutoStatusDish[] = []
      for (const cat of cats) {
        const rows = (cat.menu_items ?? [])
          .filter((i) => i.available && !!i.photo_url)
          .sort((a, b) => a.position - b.position)
        for (const i of rows) {
          dishes.push({ id: i.id, name: i.name, price: i.price, photoUrl: i.photo_url as string })
        }
      }
      return dishes
    },

    async bumpCursor(restaurantId, nextCursor) {
      const { error } = await db.from('restaurants').update({ auto_status_cursor: nextCursor }).eq('id', restaurantId)
      if (error) throw new Error(`bumpCursor: ${error.message}`)
    },

    async insertGeneratedStatuses(rows) {
      if (rows.length === 0) return
      const payload = rows.map((r) => ({
        restaurant_id: r.restaurantId,
        kind: 'image',
        content: r.content,
        media_url: r.mediaUrl,
        scheduled_at: r.scheduledAt,
        state: 'scheduled',
        audience: 'all',
      }))
      const { error } = await db.from('statuses').insert(payload)
      if (error) throw new Error(`insertGeneratedStatuses: ${error.message}`)
    },
  }
}
