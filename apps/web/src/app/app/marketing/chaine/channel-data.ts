import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WhapiClient } from '@goutatou/whapi'
import { loadChannelToken } from './channel-token'
import { HISTORY_COUNT, formatHistoryDate, formatHistoryPreview } from './shared'

export interface ChannelHistoryEntry {
  id: string
  preview: string
  date: string
}

/**
 * Nombre d'abonnés du canal, best-effort. `getNewsletter` (métadonnées d'un
 * canal précis) ne remonte pas ce champ côté client whapi — seul
 * `getNewsletters` (liste des canaux possédés/suivis) expose `subscribers`
 * (parsing défensif, cf. packages/whapi/src/client.ts). On y cherche le
 * canal rattaché par id ; `null` si l'appel échoue ou si le champ est
 * absent — l'en-tête retombe alors sur le lien d'invitation seul.
 */
export async function loadChannelSubscribers(
  supabase: SupabaseClient,
  restaurantId: string,
  waChannelId: string,
): Promise<number | null> {
  try {
    const token = await loadChannelToken(supabase, restaurantId)
    const whapi = new WhapiClient(token)
    const list = await whapi.getNewsletters()
    const match = list.find((n) => n.id === waChannelId)
    return typeof match?.subscribers === 'number' ? match.subscribers : null
  } catch {
    return null
  }
}

/** Historique des derniers posts du canal, lecture seule, best-effort. */
export async function loadChannelHistory(
  supabase: SupabaseClient,
  restaurantId: string,
  waChannelId: string,
  count: number = HISTORY_COUNT,
): Promise<ChannelHistoryEntry[]> {
  try {
    const token = await loadChannelToken(supabase, restaurantId)
    const whapi = new WhapiClient(token)
    const messages = await whapi.getChannelMessages(waChannelId, count)
    return messages.map((m, index) => ({
      id: m.id ?? `msg-${index}`,
      preview: formatHistoryPreview(m),
      date: formatHistoryDate(m.timestamp),
    }))
  } catch {
    return []
  }
}
