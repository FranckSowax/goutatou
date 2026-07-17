import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadChannelSubscribers } from './chaine/channel-data'

export interface MarketingKpis {
  /** Abonnés du canal WhatsApp — best-effort whapi ; `null` si canal absent/déconnecté. */
  subscribers: number | null
  /** Clients ayant accepté le marketing (opt-in actif). */
  optIns: number
  /** Statuts publiés ce mois-ci (hors annulés). */
  statusesThisMonth: number
  /** Sondages envoyés/actifs. */
  activePolls: number
}

/**
 * KPIs du hub Marketing. Les compteurs viennent de la base (RLS scope le resto du membre) ;
 * les abonnés chaîne d'un appel whapi best-effort (`null` sans casse si canal déconnecté).
 */
export async function getMarketingKpis(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<MarketingKpis> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [optInsRes, statusesRes, pollsRes, restoRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('marketing_opt_in', true)
      .eq('opted_out', false),
    supabase
      .from('statuses')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', startOfMonth)
      .neq('state', 'canceled'),
    supabase
      .from('polls')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .eq('status', 'sent'),
    supabase.from('restaurants').select('wa_channel_id').eq('id', restaurantId).maybeSingle(),
  ])

  const waChannelId = restoRes.data?.wa_channel_id as string | null | undefined
  const subscribers = waChannelId
    ? await loadChannelSubscribers(supabase, restaurantId, waChannelId)
    : null

  return {
    subscribers,
    optIns: optInsRes.count ?? 0,
    statusesThisMonth: statusesRes.count ?? 0,
    activePolls: pollsRes.count ?? 0,
  }
}
