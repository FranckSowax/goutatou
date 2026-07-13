import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'
import { createAutoStatusRepo, type AutoStatusDish, type AutoStatusValidation } from '../autostatus/repo.js'

/** Resto éligible à la Chaîne Auto : premium actif + auto_channel_enabled + canal WhatsApp actif + wa_channel_id renseigné. */
export interface AutoChannelCandidate {
  restaurantId: string
  name: string
  contactPhone: string | null
  waChannelId: string
  autoChannelTimes: string[]
  autoChannelCount: number
  autoChannelCursor: number
  autoChannelLastSlot: string | null
  autoStatusValidation: AutoStatusValidation
  autoStatusManagerPhone: string | null
  staffGroupId: string | null
}

export interface NewChannelPostRow {
  restaurantId: string
  content: string
  mediaUrl: string
  scheduledAt: string
}

/** Ligne insérée en `pending_approval` — id + contenu nécessaires pour l'envoi (image + boutons/sondage). */
export interface GeneratedChannelPostRef {
  id: string
  content: string
  mediaUrl: string
}

export interface AutoChannelChannel {
  token: string
  status: string
}

export interface AutoChannelRepo {
  listCandidates(): Promise<AutoChannelCandidate[]>
  /** Claim conditionnel du créneau sur `auto_channel_last_slot` (mirror autostatus/repo.ts claimSlot). */
  claimSlot(restaurantId: string, slotKey: string, previousLastSlot: string | null): Promise<boolean>
  /** Réutilise `createAutoStatusRepo(db).getPhotoDishes` — même rotation menu, pas de requête dupliquée. */
  getPhotoDishes(restaurantId: string): Promise<AutoStatusDish[]>
  bumpCursor(restaurantId: string, nextCursor: number): Promise<void>
  /** Mode 'none' : insère directement en `scheduled` (kind='image', auto_generated=true). */
  insertScheduledPosts(rows: NewChannelPostRow[]): Promise<void>
  /** Modes 'manager'/'group' : insère en `pending_approval`, renvoie les ids pour l'envoi. */
  insertPendingApprovalPosts(rows: NewChannelPostRow[]): Promise<GeneratedChannelPostRef[]>
  /** Canal Whapi du resto (token déchiffré) — nécessaire pour l'envoi de la demande de validation. */
  getChannel(restaurantId: string): Promise<AutoChannelChannel | null>
  /** Numéro/groupe validateur absent : bascule chaque post généré en `failed` (erreur FR). */
  markFailed(id: string, error: string): Promise<void>
  /** Demande de validation envoyée : trace le message (boutons gérant OU sondage groupe) + l'horodatage. */
  markApprovalRequested(ids: string[], approvalMessageId: string | undefined, requestedAtIso: string): Promise<void>
}

interface CandidateRow {
  id: string
  name: string
  contact_phone: string | null
  wa_channel_id: string
  auto_channel_times: string[] | null
  auto_channel_count: number
  auto_channel_cursor: number
  auto_channel_last_slot: string | null
  auto_status_validation: AutoStatusValidation
  auto_status_manager_phone: string | null
  staff_group_id: string | null
}

/**
 * `tokenKey` optionnel : requis uniquement pour `getChannel` (envoi de la demande de validation,
 * modes 'manager'/'group', cf. autochannel/worker.ts) — même contrat que `createAutoStatusRepo`.
 */
export function createAutoChannelRepo(db: SupabaseClient, tokenKey?: string): AutoChannelRepo {
  const autoStatusRepo = createAutoStatusRepo(db)

  return {
    async listCandidates() {
      // Jointures !inner : abonnement premium actif ET canal WhatsApp actif requis, ET wa_channel_id
      // non nul (une chaîne doit être créée côté Whapi avant toute génération auto).
      const { data } = await db
        .from('restaurants')
        .select(
          'id, name, contact_phone, wa_channel_id, auto_channel_times, auto_channel_count, ' +
            'auto_channel_cursor, auto_channel_last_slot, auto_status_validation, auto_status_manager_phone, ' +
            'staff_group_id, subscriptions!inner(plan, status), whapi_channels!inner(status)',
        )
        .eq('auto_channel_enabled', true)
        .eq('subscriptions.plan', 'premium')
        .eq('subscriptions.status', 'active')
        .eq('whapi_channels.status', 'active')
        .not('wa_channel_id', 'is', null)
      const rows = (data ?? []) as unknown as CandidateRow[]
      return rows.map((r) => ({
        restaurantId: r.id,
        name: r.name,
        contactPhone: r.contact_phone,
        waChannelId: r.wa_channel_id,
        autoChannelTimes: r.auto_channel_times ?? [],
        autoChannelCount: r.auto_channel_count,
        autoChannelCursor: r.auto_channel_cursor,
        autoChannelLastSlot: r.auto_channel_last_slot,
        autoStatusValidation: r.auto_status_validation,
        autoStatusManagerPhone: r.auto_status_manager_phone,
        staffGroupId: r.staff_group_id,
      }))
    },

    async claimSlot(restaurantId, slotKey, previousLastSlot) {
      let query = db.from('restaurants').update({ auto_channel_last_slot: slotKey }).eq('id', restaurantId)
      query = previousLastSlot === null ? query.is('auto_channel_last_slot', null) : query.eq('auto_channel_last_slot', previousLastSlot)
      const { data } = await query.select('id')
      return ((data ?? []) as { id: string }[]).length > 0
    },

    getPhotoDishes: (restaurantId) => autoStatusRepo.getPhotoDishes(restaurantId),

    async bumpCursor(restaurantId, nextCursor) {
      const { error } = await db.from('restaurants').update({ auto_channel_cursor: nextCursor }).eq('id', restaurantId)
      if (error) throw new Error(`bumpCursor: ${error.message}`)
    },

    async insertScheduledPosts(rows) {
      if (rows.length === 0) return
      const payload = rows.map((r) => ({
        restaurant_id: r.restaurantId,
        kind: 'image',
        content: r.content,
        media_url: r.mediaUrl,
        scheduled_at: r.scheduledAt,
        state: 'scheduled',
        auto_generated: true,
      }))
      const { error } = await db.from('channel_posts').insert(payload)
      if (error) throw new Error(`insertScheduledPosts: ${error.message}`)
    },

    async insertPendingApprovalPosts(rows) {
      if (rows.length === 0) return []
      const payload = rows.map((r) => ({
        restaurant_id: r.restaurantId,
        kind: 'image',
        content: r.content,
        media_url: r.mediaUrl,
        scheduled_at: r.scheduledAt,
        state: 'pending_approval',
        auto_generated: true,
      }))
      const { data, error } = await db.from('channel_posts').insert(payload).select('id, content, media_url')
      if (error) throw new Error(`insertPendingApprovalPosts: ${error.message}`)
      return ((data ?? []) as { id: string; content: string; media_url: string }[]).map((r) => ({
        id: r.id,
        content: r.content,
        mediaUrl: r.media_url,
      }))
    },

    async getChannel(restaurantId) {
      if (!tokenKey) throw new Error('getChannel: tokenKey requis (createAutoChannelRepo appelé sans clé de déchiffrement)')
      const { data } = await db
        .from('whapi_channels')
        .select('token_encrypted, status')
        .eq('restaurant_id', restaurantId)
        .single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },

    async markFailed(id, error) {
      await db.from('channel_posts').update({ state: 'failed', error }).eq('id', id)
    },

    async markApprovalRequested(ids, approvalMessageId, requestedAtIso) {
      if (ids.length === 0) return
      await db
        .from('channel_posts')
        .update({ approval_message_id: approvalMessageId ?? null, approval_requested_at: requestedAtIso })
        .in('id', ids)
    },
  }
}
