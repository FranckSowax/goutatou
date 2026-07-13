import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { WhapiClient } from '@goutatou/whapi'
import { loadChannelToken } from './channel-token'
import { HISTORY_COUNT, formatHistoryDate, formatHistoryPreview } from './shared'
import type { ChannelPostType } from './shared'

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

export interface ScheduledChannelPost {
  id: string
  kind: ChannelPostType
  content: string
  scheduled_at: string
}

/** Posts chaîne programmés (state 'scheduled'), triés par date de publication croissante. */
export async function loadScheduledPosts(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<ScheduledChannelPost[]> {
  const { data } = await supabase
    .from('channel_posts')
    .select('id, kind, content, scheduled_at')
    .eq('restaurant_id', restaurantId)
    .eq('state', 'scheduled')
    .order('scheduled_at', { ascending: true })
  return (data ?? []) as ScheduledChannelPost[]
}

export interface AutoChannelSettings {
  enabled: boolean
  times: string[]
  count: number
  /** Mode de validation hérité des Statuts Auto (colonne partagée `auto_status_validation`). */
  validationMode: 'none' | 'manager' | 'group'
}

/**
 * Réglages « Chaîne Auto » (premium). La validation avant publication est
 * réutilisée à l'identique des Statuts Auto (aucune nouvelle colonne de
 * validation, cf. plan Chaîne Auto) — lue ici en lecture seule pour rappel.
 */
export async function loadAutoChannelSettings(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<AutoChannelSettings> {
  const { data } = await supabase
    .from('restaurants')
    .select('auto_channel_enabled, auto_channel_times, auto_channel_count, auto_status_validation')
    .eq('id', restaurantId)
    .maybeSingle()
  const validation = data?.auto_status_validation
  return {
    enabled: data?.auto_channel_enabled ?? false,
    times: (data?.auto_channel_times as string[] | null) ?? [],
    count: data?.auto_channel_count ?? 1,
    validationMode: validation === 'manager' || validation === 'group' ? validation : 'none',
  }
}
