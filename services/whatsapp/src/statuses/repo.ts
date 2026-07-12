import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

export interface DueStatus {
  id: string
  restaurantId: string
  kind: 'text' | 'image' | 'video'
  content: string
  mediaUrl: string | null
  // Champs optionnels (Studio Statuts, migration 0024) : absents des fixtures existantes, le
  // worker les traite comme "pas de style / audience 'all'" — comportement byte-identique à avant.
  bgColor?: string | null
  captionColor?: string | null
  fontType?: number | null
  audience?: 'all' | 'optin'
}
export interface StatusChannel { token: string; status: string }

export interface StatusRepo {
  claimDue(nowIso: string): Promise<DueStatus[]>
  getChannel(restaurantId: string): Promise<StatusChannel | null>
  /** Chat ids opt-in (marketing_opt_in && !opted_out) — ciblage VIP (audience 'optin'). */
  optInChatIds(restaurantId: string): Promise<string[]>
  markPosted(id: string, whapiId: string | undefined): Promise<void>
  markFailed(id: string, error: string): Promise<void>
}

export function createStatusRepo(db: SupabaseClient, tokenKey: string): StatusRepo {
  return {
    async claimDue(nowIso) {
      // Passe les 'scheduled' échus en 'posting'
      await db.from('statuses').update({ state: 'posting' })
        .eq('state', 'scheduled').lte('scheduled_at', nowIso)
      const { data } = await db.from('statuses')
        .select('id, restaurant_id, kind, content, media_url, bg_color, caption_color, font_type, audience')
        .eq('state', 'posting')
      return (data ?? []).map((s) => ({
        id: s.id, restaurantId: s.restaurant_id, kind: s.kind, content: s.content, mediaUrl: s.media_url,
        bgColor: s.bg_color, captionColor: s.caption_color, fontType: s.font_type, audience: s.audience,
      })) as unknown as DueStatus[]
    },
    async getChannel(restaurantId) {
      const { data } = await db.from('whapi_channels').select('token_encrypted, status')
        .eq('restaurant_id', restaurantId).single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },
    async optInChatIds(restaurantId) {
      const { data } = await db.from('customers').select('chat_id')
        .eq('restaurant_id', restaurantId).eq('marketing_opt_in', true).eq('opted_out', false)
      return ((data ?? []) as { chat_id: string }[]).map((c) => c.chat_id)
    },
    async markPosted(id, _whapiId) {
      // Pas de colonne dédiée à l'id Whapi dans `statuses` : on trace juste l'état + l'horodatage
      await db.from('statuses').update({
        state: 'posted', posted_at: new Date().toISOString(),
      }).eq('id', id)
    },
    async markFailed(id, error) {
      await db.from('statuses').update({ state: 'failed', error }).eq('id', id)
    },
  }
}
