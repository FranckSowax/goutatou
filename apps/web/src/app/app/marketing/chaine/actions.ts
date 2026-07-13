'use server'
import { revalidatePath } from 'next/cache'
import { WhapiClient } from '@goutatou/whapi'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPlan } from '@/lib/premium'
import { loadChannelToken } from './channel-token'
import { validateImagePath, validatePollOptions, validateVideoPath } from './shared'

const CHAIN_ERROR = 'La chaîne n’est pas disponible sur ce canal.'
const ATTACH_ERROR = 'Rattachez d’abord votre chaîne.'

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

/** Garde membre + plan + chaîne rattachée (wa_channel_id non nul). */
async function myChannel() {
  const { supabase, restaurantId } = await myRestaurant()
  const { data: resto } = await supabase
    .from('restaurants')
    .select('wa_channel_id')
    .eq('id', restaurantId)
    .single()
  if (!resto?.wa_channel_id) throw new Error(ATTACH_ERROR)
  return { supabase, restaurantId, waChannelId: resto.wa_channel_id as string }
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
    token = await loadChannelToken(supabase, restaurantId)
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
  // Écriture conditionnelle anti double-clic : si un appel concurrent a déjà
  // posé un wa_channel_id, on ne l'écrase pas (course perdue = succès, la
  // chaîne surnuméraire reste orpheline côté Whapi, sans effet chez nous).
  const { error } = await admin
    .from('restaurants')
    .update({ wa_channel_id: channelId, wa_channel_invite: invite ?? null })
    .eq('id', restaurantId)
    .is('wa_channel_id', null)
  if (error) {
    throw new Error('Impossible de créer la chaîne — vérifiez que votre canal WhatsApp est connecté.')
  }

  revalidatePath('/app/marketing/chaine')
}

/** Upload d'image via Server Action, bucket `status-media` réutilisé (pattern statuts). */
export async function uploadChannelImage(formData: FormData): Promise<string> {
  const { supabase, restaurantId } = await myRestaurant()
  const file = formData.get('media') as File | null
  if (!file || file.size === 0) throw new Error('Aucun fichier')
  const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${restaurantId}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('status-media').upload(path, file)
  if (error) throw new Error(error.message)
  return supabase.storage.from('status-media').getPublicUrl(path).data.publicUrl
}

export async function postChannelText(formData: FormData) {
  const { supabase, restaurantId, waChannelId } = await myChannel()
  const body = String(formData.get('body') ?? '').trim()
  if (!body) throw new Error('Écrivez un message.')

  let token: string
  try {
    token = await loadChannelToken(supabase, restaurantId)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  const whapi = new WhapiClient(token)
  try {
    await whapi.sendNewsletterText(waChannelId, body)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  revalidatePath('/app/marketing/chaine')
}

export async function postChannelImage(formData: FormData) {
  const { supabase, restaurantId, waChannelId } = await myChannel()
  const imageUrl = String(formData.get('image_url') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim()
  if (!imageUrl) throw new Error('Ajoutez une image.')

  let token: string
  try {
    token = await loadChannelToken(supabase, restaurantId)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  const whapi = new WhapiClient(token)
  try {
    await whapi.sendNewsletterImage(waChannelId, imageUrl, caption || undefined)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  revalidatePath('/app/marketing/chaine')
}

/**
 * Vidéo uploadée en DIRECT navigateur→bucket `status-media` par le composer
 * (jamais de Server Action pour le fichier lui-même — pattern statuts) :
 * cette action ne reçoit que le chemin de stockage, revalidé (préfixe
 * `${restaurantId}/`, extension mp4) avant résolution en URL publique.
 */
export async function postChannelVideo(formData: FormData) {
  const { supabase, restaurantId, waChannelId } = await myChannel()
  const mediaPath = String(formData.get('media_path') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim()

  const pathError = validateVideoPath(mediaPath, restaurantId)
  if (pathError) throw new Error(pathError)
  const publicUrl = supabase.storage.from('status-media').getPublicUrl(mediaPath).data.publicUrl

  let token: string
  try {
    token = await loadChannelToken(supabase, restaurantId)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  const whapi = new WhapiClient(token)
  try {
    await whapi.sendChannelVideo(waChannelId, publicUrl, caption || undefined)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  revalidatePath('/app/marketing/chaine')
}

const DEFAULT_MENU_CARD_CAPTION = '📋 Notre carte — commandez sur WhatsApp !'

/**
 * Publie la carte menu (une image uploadée en DIRECT navigateur→bucket
 * `status-media` par le composer — jamais de Server Action pour le fichier,
 * pattern vidéo/statuts ci-dessus) : cette action ne reçoit que le chemin de
 * stockage, revalidé (préfixe `${restaurantId}/`, extension image) avant
 * résolution en URL publique. Pas de persistance en v1 : upload à chaque
 * publication.
 */
export async function postChannelMenuCard(formData: FormData) {
  const { supabase, restaurantId, waChannelId } = await myChannel()
  const mediaPath = String(formData.get('media_path') ?? '').trim()
  const caption = String(formData.get('caption') ?? '').trim()

  const pathError = validateImagePath(mediaPath, restaurantId)
  if (pathError) throw new Error(pathError)
  const publicUrl = supabase.storage.from('status-media').getPublicUrl(mediaPath).data.publicUrl

  let token: string
  try {
    token = await loadChannelToken(supabase, restaurantId)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  const whapi = new WhapiClient(token)
  try {
    await whapi.sendNewsletterImage(waChannelId, publicUrl, caption || DEFAULT_MENU_CARD_CAPTION)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  revalidatePath('/app/marketing/chaine')
}

export async function postChannelPoll(formData: FormData) {
  const { supabase, restaurantId, waChannelId } = await myChannel()
  const question = String(formData.get('question') ?? '')
  const rawOptions = formData.getAll('options').map((o) => String(o))
  const result = validatePollOptions(question, rawOptions)
  if (!result.ok) throw new Error(result.error)

  let token: string
  try {
    token = await loadChannelToken(supabase, restaurantId)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  const whapi = new WhapiClient(token)
  try {
    await whapi.sendPoll(waChannelId, result.question, result.options)
  } catch {
    throw new Error(CHAIN_ERROR)
  }

  revalidatePath('/app/marketing/chaine')
}
