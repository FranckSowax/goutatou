import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

/** Mode de validation avant publication (migration 0025, colonne restaurants.auto_status_validation). */
export type AutoStatusValidation = 'none' | 'manager' | 'group'

/** Resto éligible aux statuts auto : premium actif + auto_status_enabled + canal WhatsApp actif. */
export interface AutoStatusCandidate {
  restaurantId: string
  autoStatusTimes: string[]
  autoStatusCount: number
  autoStatusCursor: number
  autoStatusLastSlot: string | null
  autoStatusValidation: AutoStatusValidation
  autoStatusManagerPhone: string | null
  contactPhone: string | null
  staffGroupId: string | null
  /** Toggle premium « Écho chaîne par défaut » (restaurants.auto_status_echo_channel) — propagé aux statuts auto générés. */
  autoStatusEchoChannel: boolean
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
  /** Mirror de restaurants.auto_status_echo_channel (cf. statuses/repo.ts echoToChannel) — défaut false. */
  echoToChannel?: boolean
}

/** Ligne insérée en `pending_approval` — id + contenu nécessaires pour l'envoi (image + boutons/sondage). */
export interface GeneratedStatusRef {
  id: string
  content: string
  mediaUrl: string
}

export interface AutoStatusChannel {
  token: string
  status: string
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
  /** Mode 'none' : insère directement en `scheduled` (comportement historique). */
  insertGeneratedStatuses(rows: NewAutoStatusRow[]): Promise<void>
  /** Modes 'manager'/'group' : insère en `pending_approval`, renvoie les ids pour l'envoi. */
  insertPendingApprovalStatuses(rows: NewAutoStatusRow[]): Promise<GeneratedStatusRef[]>
  /** Canal Whapi du resto (token déchiffré) — nécessaire pour l'envoi de la demande de validation. */
  getChannel(restaurantId: string): Promise<AutoStatusChannel | null>
  /** Numéro/groupe validateur absent : bascule chaque statut généré en `failed` (erreur FR). */
  markFailed(id: string, error: string): Promise<void>
  /** Demande de validation envoyée : trace le message (boutons gérant OU sondage groupe) + l'horodatage. */
  markApprovalRequested(ids: string[], approvalMessageId: string | undefined, requestedAtIso: string): Promise<void>
}

interface CandidateRow {
  id: string
  auto_status_times: string[] | null
  auto_status_count: number
  auto_status_cursor: number
  auto_status_last_slot: string | null
  auto_status_validation: AutoStatusValidation
  auto_status_manager_phone: string | null
  contact_phone: string | null
  staff_group_id: string | null
  auto_status_echo_channel: boolean
}

/**
 * `tokenKey` optionnel : requis uniquement pour `getChannel` (envoi de la demande de validation,
 * modes 'manager'/'group', cf. autostatus/worker.ts). `createApprovalRepo` (autostatus/approval-repo.ts)
 * réutilise cette factory pour la seule rotation des plats (getPhotoDishes) sans jamais appeler
 * `getChannel` — appel à un seul argument toujours valide pour cet usage-là.
 */
export function createAutoStatusRepo(db: SupabaseClient, tokenKey?: string): AutoStatusRepo {
  return {
    async listCandidates() {
      // Jointures !inner : abonnement premium actif ET canal WhatsApp actif requis (filtres
      // appliqués côté PostgREST sur les tables embarquées, pattern catalog/repo.ts claimSyncRequests).
      const { data } = await db
        .from('restaurants')
        .select(
          'id, auto_status_times, auto_status_count, auto_status_cursor, auto_status_last_slot, ' +
            'auto_status_validation, auto_status_manager_phone, contact_phone, staff_group_id, ' +
            'auto_status_echo_channel, ' +
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
        autoStatusValidation: r.auto_status_validation,
        autoStatusManagerPhone: r.auto_status_manager_phone,
        contactPhone: r.contact_phone,
        staffGroupId: r.staff_group_id,
        autoStatusEchoChannel: r.auto_status_echo_channel,
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
        auto_generated: true,
        echo_to_channel: r.echoToChannel ?? false,
      }))
      const { error } = await db.from('statuses').insert(payload)
      if (error) throw new Error(`insertGeneratedStatuses: ${error.message}`)
    },

    async insertPendingApprovalStatuses(rows) {
      if (rows.length === 0) return []
      const payload = rows.map((r) => ({
        restaurant_id: r.restaurantId,
        kind: 'image',
        content: r.content,
        media_url: r.mediaUrl,
        scheduled_at: r.scheduledAt,
        state: 'pending_approval',
        audience: 'all',
        auto_generated: true,
        echo_to_channel: r.echoToChannel ?? false,
      }))
      const { data, error } = await db.from('statuses').insert(payload).select('id, content, media_url')
      if (error) throw new Error(`insertPendingApprovalStatuses: ${error.message}`)
      return ((data ?? []) as { id: string; content: string; media_url: string }[]).map((r) => ({
        id: r.id,
        content: r.content,
        mediaUrl: r.media_url,
      }))
    },

    async getChannel(restaurantId) {
      if (!tokenKey) throw new Error('getChannel: tokenKey requis (createAutoStatusRepo appelé sans clé de déchiffrement)')
      const { data } = await db
        .from('whapi_channels')
        .select('token_encrypted, status')
        .eq('restaurant_id', restaurantId)
        .single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },

    async markFailed(id, error) {
      await db.from('statuses').update({ state: 'failed', error }).eq('id', id)
    },

    async markApprovalRequested(ids, approvalMessageId, requestedAtIso) {
      if (ids.length === 0) return
      await db
        .from('statuses')
        .update({ approval_message_id: approvalMessageId ?? null, approval_requested_at: requestedAtIso })
        .in('id', ids)
    },
  }
}
