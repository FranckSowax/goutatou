'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { assertPlan, isPremium } from '@/lib/premium'
import {
  MAX_CARDS,
  computeScheduledAt,
  computeState,
  validateCard,
  type RawStatusCard,
  type StatusPublishMode,
} from './shared'

async function myRestaurantId() {
  const supabase = await createSupabaseServer()
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
 * Résout `media_url` pour l'insertion : image = URL déjà résolue par
 * `uploadStatusMedia` (Server Action existante, inchangée) ; vidéo = chemin
 * de stockage uploadé en DIRECT navigateur→bucket (jamais via Server
 * Action — les fichiers vidéo dépassent la limite de corps), le chemin est
 * revalidé ici (préfixe `${restaurantId}/`, déjà fait par `validateCard`)
 * puis résolu en URL publique côté serveur, comme `setHeroMedia` (hero LP).
 */
function resolveMediaUrl(
  supabase: Awaited<ReturnType<typeof createSupabaseServer>>,
  card: { kind: string; mediaUrl: string | null; mediaPath: string | null },
): string | null {
  if (card.kind === 'video' && card.mediaPath) {
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

/** Upload d'image via Server Action (inchangé) — la vidéo passe en DIRECT côté composer. */
export async function uploadStatusMedia(formData: FormData): Promise<string> {
  const { supabase, restaurantId } = await myRestaurantId()
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  const file = formData.get('media') as File | null
  if (!file || file.size === 0) throw new Error('Aucun fichier')
  const safeName = file.name.replace(/^.*[\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${restaurantId}/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from('status-media').upload(path, file)
  if (error) throw new Error(error.message)
  return supabase.storage.from('status-media').getPublicUrl(path).data.publicUrl
}
