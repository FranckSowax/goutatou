'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertPlan, assertPremium, isPremium } from '@/lib/premium'
import { assertOwner } from '@/lib/roles'
import {
  MAX_CARDS,
  computeScheduledAt,
  computeState,
  isAutoStatusValidationMode,
  validateAutoStatusCount,
  validateAutoStatusTimes,
  validateCard,
  validateManagerPhone,
  type AutoStatusValidationMode,
  type RawStatusCard,
  type StatusPublishMode,
} from './shared'

async function myRestaurantId() {
  const supabase = await createSupabaseServer()
  await assertOwner(supabase)
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return { supabase, restaurantId: data.restaurant_id as string }
}

function readRawCard(formData: FormData): RawStatusCard {
  return {
    kind: String(formData.get('kind') ?? 'text') as RawStatusCard['kind'],
    content: String(formData.get('content') ?? ''),
    mediaUrl: String(formData.get('media_url') ?? ''),
    mediaPath: String(formData.get('media_path') ?? ''),
    bgColor: String(formData.get('bg_color') ?? '#1F2C34'),
    captionColor: String(formData.get('caption_color') ?? '#FFFFFF'),
    fontType: Number.parseInt(String(formData.get('font_type') ?? '0'), 10),
    audience: String(formData.get('audience') ?? 'all') as RawStatusCard['audience'],
    scheduledAt: String(formData.get('scheduled_at') ?? ''),
  }
}

/**
 * Résout `media_url` pour l'insertion : image ET vidéo sont uploadées en
 * DIRECT navigateur→bucket `status-media` (jamais via Server Action — plus
 * de 404 dû à un id de Server Action périmé sur un onglet resté ouvert), le
 * composer ne transmet que le chemin de stockage. Le chemin est revalidé
 * ici (préfixe `${restaurantId}/`, déjà fait par `validateCard`) puis résolu
 * en URL publique côté serveur, comme `setHeroMedia` (hero LP).
 */
function resolveMediaUrl(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  card: { kind: string; mediaUrl: string | null; mediaPath: string | null },
): string | null {
  if ((card.kind === 'video' || card.kind === 'image') && card.mediaPath) {
    return supabase.storage.from('status-media').getPublicUrl(card.mediaPath).data.publicUrl
  }
  return card.mediaUrl
}

/** Crée un unique statut (formulaire simple, conserve la compatibilité du contrat existant). */
export async function createStatus(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const premium = await isPremium(supabase, restaurantId)

  const raw = readRawCard(formData)
  const result = validateCard(raw, { restaurantId, isPremium: premium })
  if (!result.ok) throw new Error(result.error)
  const card = result.card

  const action = String(formData.get('action') ?? 'draft') as StatusPublishMode | 'now' | 'schedule'
  const mode: StatusPublishMode = action === 'now' ? 'chain' : action === 'schedule' ? 'schedule' : 'draft'
  if (mode === 'schedule' && !card.scheduledAt) {
    throw new Error('Choisissez une date et une heure.')
  }

  const mediaUrl = resolveMediaUrl(supabase, card)
  const scheduledAt = computeScheduledAt(mode, 0, card.scheduledAt, Date.now())
  const state = computeState(mode, 0)
  const echoToChannel = formData.get('echo_to_channel') === 'true'

  const { error } = await supabase.from('statuses').insert({
    restaurant_id: restaurantId,
    kind: card.kind,
    content: card.content,
    media_url: mediaUrl,
    bg_color: card.bgColor,
    caption_color: card.captionColor,
    font_type: card.fontType,
    audience: card.audience,
    state,
    scheduled_at: scheduledAt,
    echo_to_channel: echoToChannel,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/app/marketing/statuts')
}

/** Crée un lot de statuts depuis le composer multi-cartes (≤ MAX_CARDS). */
export async function createStatusBatch(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const premium = await isPremium(supabase, restaurantId)

  const mode = String(formData.get('mode') ?? 'draft') as StatusPublishMode
  if (mode !== 'chain' && mode !== 'schedule' && mode !== 'draft') {
    throw new Error('Mode de publication invalide.')
  }

  let rawCards: RawStatusCard[]
  try {
    rawCards = JSON.parse(String(formData.get('cards_json') ?? '[]')) as RawStatusCard[]
  } catch {
    throw new Error('Cartes invalides.')
  }
  if (!Array.isArray(rawCards) || rawCards.length === 0) {
    throw new Error('Ajoutez au moins une carte.')
  }
  if (rawCards.length > MAX_CARDS) {
    throw new Error(`Limitez-vous à ${MAX_CARDS} cartes par envoi.`)
  }

  // Écho statut → chaîne : un seul état global pour tout le lot (pas par
  // carte, cf. plan Chaîne Auto — choix « globale pour simplicité »).
  const echoToChannel = formData.get('echo_to_channel') === 'true'

  const now = Date.now()
  const rows = rawCards.map((raw, index) => {
    const result = validateCard(raw, { restaurantId, isPremium: premium })
    if (!result.ok) throw new Error(`Carte ${index + 1} : ${result.error}`)
    const card = result.card
    if (mode === 'schedule' && !card.scheduledAt) {
      throw new Error(`Carte ${index + 1} : choisissez une date et une heure.`)
    }
    return {
      restaurant_id: restaurantId,
      kind: card.kind,
      content: card.content,
      media_url: resolveMediaUrl(supabase, card),
      bg_color: card.bgColor,
      caption_color: card.captionColor,
      font_type: card.fontType,
      audience: card.audience,
      state: computeState(mode, index),
      scheduled_at: computeScheduledAt(mode, index, card.scheduledAt, now),
      echo_to_channel: echoToChannel,
    }
  })

  const { error } = await supabase.from('statuses').insert(rows)
  if (error) throw new Error(error.message)
  revalidatePath('/app/marketing/statuts')
}

export async function cancelStatus(id: string) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const { error } = await supabase.from('statuses').update({ state: 'canceled' })
    .eq('id', id).in('state', ['scheduled', 'posting'])
  if (error) throw new Error(error.message)
  revalidatePath('/app/marketing/statuts')
}

/**
 * Enregistre les réglages « Statuts Auto » (premium) : garde membre +
 * premium (spec §Statuts Auto — publication quotidienne des plats), écriture
 * `restaurants` via client admin (pas de policy RLS UPDATE membre sur cette
 * table, pattern 3A — cf. updateMyRestaurantProfile dans /app/reglages).
 */
export async function updateAutoStatus(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPremium(supabase, restaurantId)

  const enabled = formData.get('enabled') === 'on'
  const rawTimes = [String(formData.get('time_1') ?? ''), String(formData.get('time_2') ?? '')]
  const timesResult = validateAutoStatusTimes(rawTimes)
  if (!timesResult.ok) throw new Error(timesResult.error)

  const count = Number.parseInt(String(formData.get('count') ?? ''), 10)
  if (!validateAutoStatusCount(count)) {
    throw new Error('Nombre de statuts par créneau invalide (1 à 3).')
  }

  const rawValidation = String(formData.get('validation') ?? 'none')
  const validation: AutoStatusValidationMode = isAutoStatusValidationMode(rawValidation) ? rawValidation : 'none'

  // Le numéro du gérant n'est exigé (et stocké) qu'en mode 'manager' — dans
  // les autres modes il n'est ni affiché ni transmis par le formulaire.
  let managerPhone: string | null = null
  if (validation === 'manager') {
    const phoneResult = validateManagerPhone(String(formData.get('manager_phone') ?? ''))
    if (!phoneResult.ok) throw new Error(phoneResult.error)
    managerPhone = phoneResult.phone
  }

  // Écho chaîne par défaut (Chaîne Auto) : appliqué aux statuts générés par
  // le worker Statuts Auto (cf. plan Chaîne Auto — colonne indépendante,
  // n'affecte pas la case « Publier aussi sur la chaîne » du composer manuel).
  const echoChannel = formData.get('echo_channel') === 'on'

  // Ancrage anti-rattrapage (revue finale) : à l'enregistrement, on pose
  // auto_status_last_slot sur le dernier créneau déjà passé AUJOURD'HUI
  // (heure de Libreville, UTC+1 fixe). Le worker ne publie qu'après le
  // PROCHAIN créneau — activer à 19 h ne déclenche pas le statut de 11 h 30.
  const lbv = new Date(Date.now() + 3600_000)
  const dateKey = lbv.toISOString().slice(0, 10)
  const hhmm = lbv.toISOString().slice(11, 16)
  const pastSlots = timesResult.times.filter((t) => t <= hhmm).sort()
  const anchor = pastSlots.length > 0 ? `${dateKey} ${pastSlots[pastSlots.length - 1]}` : null

  const admin = createAdminClient()
  const { data, error } = await admin.from('restaurants')
    .update({
      auto_status_enabled: enabled,
      auto_status_times: timesResult.times,
      auto_status_count: count,
      auto_status_last_slot: anchor,
      auto_status_validation: validation,
      auto_status_manager_phone: managerPhone,
      auto_status_echo_channel: echoChannel,
    })
    .eq('id', restaurantId)
    .select('id')
  if (error || !data || data.length === 0) throw new Error('Enregistrement impossible.')
  revalidatePath('/app/marketing/statuts')
}
