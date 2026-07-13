import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db/crypto'

/**
 * Décrypte le token du canal Whapi — jamais transmis au client. Partagé
 * entre `actions.ts` (écritures) et `channel-data.ts` (lectures best-effort
 * pour l'en-tête/l'historique), pour éviter de dupliquer le décryptage.
 */
export async function loadChannelToken(
  supabase: SupabaseClient,
  restaurantId: string,
): Promise<string> {
  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('token_encrypted')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!channel) throw new Error('canal absent')
  return decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
}
