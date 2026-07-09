import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

export interface DueStatus { id: string; restaurantId: string; kind: 'text' | 'image'; content: string; mediaUrl: string | null }
export interface StatusChannel { token: string; status: string }

export interface StatusRepo {
  claimDue(nowIso: string): Promise<DueStatus[]>
  getChannel(restaurantId: string): Promise<StatusChannel | null>
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
        .select('id, restaurant_id, kind, content, media_url').eq('state', 'posting')
      return (data ?? []).map((s) => ({
        id: s.id, restaurantId: s.restaurant_id, kind: s.kind, content: s.content, mediaUrl: s.media_url,
      })) as unknown as DueStatus[]
    },
    async getChannel(restaurantId) {
      const { data } = await db.from('whapi_channels').select('token_encrypted, status')
        .eq('restaurant_id', restaurantId).single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
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
