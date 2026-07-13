import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, type PollSurface } from '@goutatou/db'

export type PollTarget = 'channel' | 'optin'

export interface ClaimedPoll {
  id: string
  restaurantId: string
  question: string
  options: string[]
  quizCorrect: number | null
  target: PollTarget
  surfaces: PollSurface[]
  teaserImageUrl: string | null
}

export interface PollChannel {
  token: string
  status: string
  waChannelId: string | null
  waChannelInvite: string | null
  staffGroupId: string | null
}

export interface FinishResult {
  status: 'sent' | 'failed'
  sentCount: number
  error?: string | null
}

export interface RecordSurfacePatch {
  status: 'sent' | 'failed'
  messageId?: string
}

export interface PollRepo {
  claimQueued(): Promise<ClaimedPoll[]>
  getChannel(restaurantId: string): Promise<PollChannel | null>
  optInChatIds(restaurantId: string): Promise<string[]>
  /**
   * Merge dans `surface_status` (jsonb) l'entrée `<surface>: status` et, quand un `messageId` est
   * fourni pour `channel`/`group`, écrit `channel_message_id`/`group_message_id` (id du message
   * natif — nécessaire pour relire les votes via `readPollResults`). `status_teaser` n'a pas de
   * message natif (c'est un statut, pas un sondage) : jamais de messageId pour cette surface.
   */
  recordSurface(pollId: string, surface: PollSurface, patch: RecordSurfacePatch): Promise<void>
  /**
   * Insère le statut-teaser (kind déduit de mediaUrl) en `scheduled` (le status-worker déjà
   * déployé se charge de la publication), puis pose `polls.status_id` sur `pollId` pour tracer le
   * lien. Renvoie l'id du statut inséré.
   */
  insertTeaserStatus(restaurantId: string, content: string, mediaUrl: string | null, pollId: string): Promise<string>
  finish(pollId: string, result: FinishResult): Promise<void>
}

interface PollQueueRow {
  id: string
  restaurant_id: string
  question: string
  options: string[]
  quiz_correct: number | null
  target: PollTarget
  surfaces: PollSurface[] | null
  teaser_image_url: string | null
}

export function createPollRepo(db: SupabaseClient, tokenKey: string): PollRepo {
  return {
    async claimQueued() {
      // Le canal actif ne peut pas être exprimé dans une seule requête `update` (PostgREST ne
      // filtre pas un update par une ressource embarquée) : on lit d'abord les sondages 'queued'
      // dont le resto a un canal Whapi actif (jointure imbriquée polls -> restaurants ->
      // whapi_channels, pattern catalog/repo.ts claimSyncRequests), puis on claim par update
      // conditionnel sur les seuls ids retenus (guard `.eq('status','queued')` : ne consomme
      // que ce qui est encore en file au moment du claim).
      const { data } = await db
        .from('polls')
        .select(
          'id, restaurant_id, question, options, quiz_correct, target, surfaces, teaser_image_url, restaurants!inner(whapi_channels!inner(status))',
        )
        .eq('status', 'queued')
        .eq('restaurants.whapi_channels.status', 'active')
      const rows = (data ?? []) as unknown as PollQueueRow[]
      const ids = rows.map((r) => r.id)
      if (ids.length === 0) return []

      const { data: claimed } = await db
        .from('polls')
        .update({ status: 'sending' })
        .in('id', ids)
        .eq('status', 'queued')
        .select('id, restaurant_id, question, options, quiz_correct, target, surfaces, teaser_image_url')
      return ((claimed ?? []) as unknown as PollQueueRow[]).map((r) => ({
        id: r.id,
        restaurantId: r.restaurant_id,
        question: r.question,
        options: r.options,
        quizCorrect: r.quiz_correct,
        target: r.target,
        surfaces: r.surfaces ?? [],
        teaserImageUrl: r.teaser_image_url,
      }))
    },

    async getChannel(restaurantId) {
      const { data } = await db
        .from('restaurants')
        .select('wa_channel_id, wa_channel_invite, staff_group_id, whapi_channels(token_encrypted, status)')
        .eq('id', restaurantId)
        .single()
      if (!data) return null
      const raw = data as unknown as {
        wa_channel_id: string | null
        wa_channel_invite: string | null
        staff_group_id: string | null
        whapi_channels: { token_encrypted: string; status: string } | { token_encrypted: string; status: string }[] | null
      }
      const wc = Array.isArray(raw.whapi_channels) ? raw.whapi_channels[0] : raw.whapi_channels
      if (!wc) return null
      return {
        token: decryptToken(wc.token_encrypted, tokenKey),
        status: wc.status,
        waChannelId: raw.wa_channel_id,
        waChannelInvite: raw.wa_channel_invite,
        staffGroupId: raw.staff_group_id,
      }
    },

    async optInChatIds(restaurantId) {
      const { data } = await db
        .from('customers')
        .select('chat_id')
        .eq('restaurant_id', restaurantId)
        .eq('marketing_opt_in', true)
        .eq('opted_out', false)
      return ((data ?? []) as { chat_id: string }[]).map((c) => c.chat_id)
    },

    async recordSurface(pollId, surface, patch) {
      const { data } = await db.from('polls').select('surface_status').eq('id', pollId).single()
      const current = ((data as { surface_status?: Record<string, string> } | null)?.surface_status ?? {}) as Record<
        string,
        string
      >
      const nextSurfaceStatus = { ...current, [surface]: patch.status }
      const update: Record<string, unknown> = { surface_status: nextSurfaceStatus }
      if (patch.messageId && surface === 'channel') update.channel_message_id = patch.messageId
      if (patch.messageId && surface === 'group') update.group_message_id = patch.messageId
      const { error } = await db.from('polls').update(update).eq('id', pollId)
      if (error) throw new Error(`recordSurface: ${error.message}`)
    },

    async insertTeaserStatus(restaurantId, content, mediaUrl, pollId) {
      const { data, error } = await db
        .from('statuses')
        .insert({
          restaurant_id: restaurantId,
          kind: mediaUrl ? 'image' : 'text',
          content,
          media_url: mediaUrl,
          scheduled_at: new Date().toISOString(),
          state: 'scheduled',
          audience: 'all',
          auto_generated: false,
        })
        .select('id')
        .single()
      if (error || !data) throw new Error(`insertTeaserStatus: ${error?.message ?? 'insert vide'}`)
      const statusId = (data as { id: string }).id
      const { error: updErr } = await db.from('polls').update({ status_id: statusId }).eq('id', pollId)
      if (updErr) throw new Error(`insertTeaserStatus: ${updErr.message}`)
      return statusId
    },

    async finish(pollId, result) {
      const { error: updErr } = await db
        .from('polls')
        .update({
          status: result.status,
          sent_count: result.sentCount,
          error: result.error ?? null,
          sent_at: result.status === 'sent' ? new Date().toISOString() : null,
        })
        .eq('id', pollId)
      if (updErr) throw new Error(`finish: ${updErr.message}`)
    },
  }
}
