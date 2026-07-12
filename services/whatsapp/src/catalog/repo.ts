import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

export interface ClaimedSync { restaurantId: string }
export interface CatalogChannel { token: string; status: string }
export interface CatalogItem {
  id: string
  name: string
  price: number
  description: string | null
  photoUrl: string
  waProductId: string | null
}

export interface CatalogRepo {
  claimSyncRequests(): Promise<ClaimedSync[]>
  getChannel(restaurantId: string): Promise<CatalogChannel | null>
  /** Plats DISPONIBLES avec photo (contrainte Whapi : `images` requis par produit) — position catégorie puis plat. */
  getSyncableItems(restaurantId: string): Promise<CatalogItem[]>
  setWaProductId(itemId: string, waId: string | null): Promise<void>
  /** Efface wa_product_id sur le(s) plat(s) qui pointaient vers ce produit Whapi supprimé (plat devenu indisponible). */
  clearWaProductId(waId: string): Promise<void>
  finishSync(restaurantId: string, error: string | null): Promise<void>
}

interface RestaurantSyncRow {
  id: string
  catalog_sync_requested_at: string | null
  catalog_synced_at: string | null
  whapi_channels: { status: string } | { status: string }[] | null
}

export function createCatalogRepo(db: SupabaseClient, tokenKey: string): CatalogRepo {
  return {
    async claimSyncRequests() {
      // Comparaison de deux colonnes (requested_at > synced_at) non exprimable via le query
      // builder PostgREST (filtres = littéraux) : on lit large (catalog_enabled + requested_at
      // non null + canal actif) puis on filtre en JS (pattern lpframes/repo.ts listCandidates),
      // avant de claim par update conditionnel sur les seuls ids retenus. Non-atomique mais
      // acceptable : worker mono-réplica, un crash entre lecture et claim perd juste la demande
      // (l'admin re-clique « Synchroniser »).
      const { data } = await db
        .from('restaurants')
        .select('id, catalog_sync_requested_at, catalog_synced_at, whapi_channels!inner(status)')
        .eq('catalog_enabled', true)
        .not('catalog_sync_requested_at', 'is', null)
        .eq('whapi_channels.status', 'active')
      const rows = (data ?? []) as unknown as RestaurantSyncRow[]
      const dueIds = rows
        .filter((r) => {
          const requested = r.catalog_sync_requested_at
          const synced = r.catalog_synced_at
          return !!requested && (!synced || requested > synced)
        })
        .map((r) => r.id)
      if (dueIds.length === 0) return []

      // Claim : n'efface que les demandes encore posées au moment du claim (garde une demande
      // arrivée entre-temps, même si le risque réel est nul en mono-réplica).
      const { data: claimed } = await db
        .from('restaurants')
        .update({ catalog_sync_requested_at: null })
        .in('id', dueIds)
        .not('catalog_sync_requested_at', 'is', null)
        .select('id')
      return ((claimed ?? []) as { id: string }[]).map((r) => ({ restaurantId: r.id }))
    },

    async getChannel(restaurantId) {
      const { data } = await db.from('whapi_channels').select('token_encrypted, status')
        .eq('restaurant_id', restaurantId).single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },

    async getSyncableItems(restaurantId) {
      const { data } = await db
        .from('menu_categories')
        .select('position, menu_items(id, name, price, description, photo_url, wa_product_id, available, position)')
        .eq('restaurant_id', restaurantId)
        .order('position')
      const cats = (data ?? []) as unknown as {
        position: number
        menu_items: {
          id: string; name: string; price: number; description: string | null
          photo_url: string | null; wa_product_id: string | null; available: boolean; position: number
        }[] | null
      }[]
      const items: CatalogItem[] = []
      for (const cat of cats) {
        const rows = (cat.menu_items ?? [])
          .filter((i) => i.available && !!i.photo_url)
          .sort((a, b) => a.position - b.position)
        for (const i of rows) {
          items.push({
            id: i.id, name: i.name, price: i.price, description: i.description,
            photoUrl: i.photo_url as string, waProductId: i.wa_product_id,
          })
        }
      }
      return items
    },

    async setWaProductId(itemId, waId) {
      const { error } = await db.from('menu_items').update({ wa_product_id: waId }).eq('id', itemId)
      if (error) throw new Error(`setWaProductId: ${error.message}`)
    },

    async clearWaProductId(waId) {
      const { error } = await db.from('menu_items').update({ wa_product_id: null }).eq('wa_product_id', waId)
      if (error) throw new Error(`clearWaProductId: ${error.message}`)
    },

    async finishSync(restaurantId, error) {
      const { error: updErr } = await db.from('restaurants').update({
        catalog_synced_at: new Date().toISOString(), catalog_sync_error: error,
      }).eq('id', restaurantId)
      if (updErr) throw new Error(`finishSync: ${updErr.message}`)
    },
  }
}
