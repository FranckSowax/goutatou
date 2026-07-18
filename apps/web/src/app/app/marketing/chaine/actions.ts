'use server'
import { revalidatePath } from 'next/cache'
import { WhapiClient } from '@goutatou/whapi'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPlan } from '@/lib/premium'
import { assertOwner } from '@/lib/roles'
import { loadChannelToken } from './channel-token'
import {
  validateAutoChannelCount,
  validateAutoChannelTimes,
  validateImagePath,
  validatePollOptions,
  validateScheduledAt,
  validateVideoPath,
  type ChannelPostType,
} from './shared'

const CHAIN_ERROR = 'La chaîne n’est pas disponible sur ce canal.'
const ATTACH_ERROR = 'Rattachez d’abord votre chaîne.'

/**
 * Garde membre + plan (chaîne = Pro comme statuts). Retourne un client Supabase
 * RLS-bound (lecture whapi_channels/restaurants autorisée pour les membres) —
 * jamais le client admin ici, réservé aux écritures sur `restaurants` (pattern 3A).
 */
async function myRestaurant() {
  const supabase = await createSupabaseServer()
  await assertOwner(supabase)
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

/**
 * Image uploadée en DIRECT navigateur→bucket `status-media` par le composer
 * (jamais de Server Action pour le fichier lui-même — pattern vidéo/carte
 * menu ci-dessous) : cette action ne reçoit que le chemin de stockage,
 * revalidé (préfixe `${restaurantId}/`, extension image) avant résolution en
 * URL publique.
 */
export async function postChannelImage(formData: FormData) {
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
    await whapi.sendNewsletterImage(waChannelId, publicUrl, caption || undefined)
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

/**
 * Programme un post chaîne (table `channel_posts`, source unique des posts
 * programmés ET auto — cf. plan Chaîne Auto). v1 : text/image/menu_card
 * seulement (vidéo/sondage hors scope programmation). Image/carte menu
 * uploadées en DIRECT navigateur→bucket `status-media` par le composer :
 * cette action ne reçoit que le chemin de stockage, revalidé avant
 * résolution en URL publique (même pattern que les publications immédiates
 * ci-dessus).
 */
export async function scheduleChannelPost(formData: FormData) {
  const { supabase, restaurantId } = await myChannel()
  const kind = String(formData.get('kind') ?? 'text') as ChannelPostType
  if (kind !== 'text' && kind !== 'image' && kind !== 'menu_card') {
    throw new Error('Type de post invalide pour la programmation.')
  }

  const scheduledAtRaw = String(formData.get('scheduled_at') ?? '').trim()
  const scheduledError = validateScheduledAt(scheduledAtRaw, new Date().toISOString())
  if (scheduledError) throw new Error(scheduledError)

  const content = String(formData.get('content') ?? '').trim()
  let mediaUrl: string | null = null

  if (kind === 'image' || kind === 'menu_card') {
    const mediaPath = String(formData.get('media_path') ?? '').trim()
    const pathError = validateImagePath(mediaPath, restaurantId)
    if (pathError) throw new Error(pathError)
    mediaUrl = supabase.storage.from('status-media').getPublicUrl(mediaPath).data.publicUrl
  } else if (!content) {
    throw new Error('Écrivez un message.')
  }

  const { error } = await supabase.from('channel_posts').insert({
    restaurant_id: restaurantId,
    kind,
    content,
    media_url: mediaUrl,
    scheduled_at: new Date(scheduledAtRaw).toISOString(),
    state: 'scheduled',
    auto_generated: false,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/marketing/chaine')
}

/** Annule un post chaîne programmé (garde tenant + état — n'annule qu'un post encore 'scheduled'). */
export async function cancelScheduledPost(formData: FormData) {
  const { supabase, restaurantId } = await myChannel()
  const postId = String(formData.get('post_id') ?? '').trim()
  if (!postId) throw new Error('Post introuvable.')
  const { error } = await supabase
    .from('channel_posts')
    .update({ state: 'canceled' })
    .eq('id', postId)
    .eq('restaurant_id', restaurantId)
    .eq('state', 'scheduled')
  if (error) throw new Error(error.message)
  revalidatePath('/app/marketing/chaine')
}

/**
 * Enregistre les réglages « Chaîne Auto » (premium — réservé au plan
 * premium, contrairement au reste de la chaîne qui reste Pro). Écriture
 * `restaurants` via client admin (pas de policy RLS UPDATE membre sur cette
 * table, pattern repris de `updateAutoStatus`).
 */
export async function saveAutoChannelSettings(formData: FormData) {
  const { supabase, restaurantId } = await myChannel()
  await assertPlan(supabase, restaurantId, ['premium'])

  const enabled = formData.get('enabled') === 'on'
  const rawTimes = [String(formData.get('time_1') ?? ''), String(formData.get('time_2') ?? '')]
  const timesResult = validateAutoChannelTimes(rawTimes)
  if (!timesResult.ok) throw new Error(timesResult.error)

  const count = Number.parseInt(String(formData.get('count') ?? ''), 10)
  if (!validateAutoChannelCount(count)) {
    throw new Error('Nombre de posts par créneau invalide (1 à 3).')
  }

  // Ancrage anti-rattrapage (même logique que saveAutoStatusSettings) : à
  // l'enregistrement on pose auto_channel_last_slot sur le dernier créneau déjà
  // passé AUJOURD'HUI (heure de Libreville, UTC+1 fixe), pour que le worker ne
  // publie qu'à partir du PROCHAIN créneau — activer à 19 h ne rattrape pas
  // celui de 11 h 30.
  const lbv = new Date(Date.now() + 3600_000)
  const dateKey = lbv.toISOString().slice(0, 10)
  const hhmm = lbv.toISOString().slice(11, 16)
  const pastSlots = timesResult.times.filter((t) => t <= hhmm).sort()
  const anchor = pastSlots.length > 0 ? `${dateKey} ${pastSlots[pastSlots.length - 1]}` : null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('restaurants')
    .update({
      auto_channel_enabled: enabled,
      auto_channel_times: timesResult.times,
      auto_channel_count: count,
      auto_channel_last_slot: anchor,
    })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/marketing/chaine')
}
