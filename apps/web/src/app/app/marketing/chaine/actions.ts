'use server'
import { revalidatePath } from 'next/cache'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPlan } from '@/lib/premium'

/**
 * Garde membre + plan (chaîne = Pro comme statuts). Retourne un client Supabase
 * RLS-bound (lecture whapi_channels/restaurants autorisée pour les membres) —
 * jamais le client admin ici, réservé aux écritures sur `restaurants` (pattern 3A).
 */
async function myRestaurant() {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  const restaurantId = data.restaurant_id as string
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  return { supabase, restaurantId }
}

/** Décrypte le token du canal DANS l'action — jamais transmis au client. */
async function loadToken(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  restaurantId: string
): Promise<string> {
  const { data: channel } = await supabase
    .from('whapi_channels')
    .select('token_encrypted')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (!channel) throw new Error('canal absent')
  return decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
}

export async function createChannelAction() {
  const { supabase, restaurantId } = await myRestaurant()

  const { data: resto, error: restoErr } = await supabase
    .from('restaurants')
    .select('name, wa_channel_id')
    .eq('id', restaurantId)
    .single()
  if (restoErr || !resto) throw new Error('Restaurant introuvable.')
  if (resto.wa_channel_id) {
    revalidatePath('/app/marketing/chaine')
    return
  }

  let token: string
  try {
    token = await loadToken(supabase, restaurantId)
  } catch {
    throw new Error('Impossible de créer la chaîne — vérifiez que votre canal WhatsApp est connecté.')
  }

  const whapi = new WhapiClient(token)
  let channelId: string
  let invite: string | undefined
  try {
    const created = await whapi.createNewsletter(resto.name)
    if (!created.id) throw new Error('id manquant')
    channelId = created.id
    invite = created.invite
    if (!invite) {
      const full = await whapi.getNewsletter(channelId)
      invite = full.invite
    }
  } catch {
    throw new Error('Impossible de créer la chaîne — vérifiez que votre canal WhatsApp est connecté.')
  }

  const admin = createAdminClient()
  const { data: updated, error } = await admin
    .from('restaurants')
    .update({ wa_channel_id: channelId, wa_channel_invite: invite ?? null })
    .eq('id', restaurantId)
    .select('id')
  if (error || !updated || updated.length === 0) {
    throw new Error('Impossible de créer la chaîne — vérifiez que votre canal WhatsApp est connecté.')
  }

  revalidatePath('/app/marketing/chaine')
}

export async function sendChannelMessageAction(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurant()

  const { data: resto } = await supabase
    .from('restaurants')
    .select('wa_channel_id')
    .eq('id', restaurantId)
    .single()
  if (!resto?.wa_channel_id) throw new Error('La chaîne n’est pas disponible sur ce canal.')

  const body = String(formData.get('body') ?? '').trim()
  const imageUrl = String(formData.get('image_url') ?? '').trim()
  if (!body && !imageUrl) throw new Error('Écrivez un message ou une URL d’image.')

  let token: string
  try {
    token = await loadToken(supabase, restaurantId)
  } catch {
    throw new Error('La chaîne n’est pas disponible sur ce canal.')
  }

  const whapi = new WhapiClient(token)
  try {
    if (imageUrl) {
      await whapi.sendNewsletterImage(resto.wa_channel_id, imageUrl, body || undefined)
    } else {
      await whapi.sendNewsletterText(resto.wa_channel_id, body)
    }
  } catch {
    throw new Error('La chaîne n’est pas disponible sur ce canal.')
  }

  revalidatePath('/app/marketing/chaine')
}
