'use server'
import { revalidatePath } from 'next/cache'
import { WhapiClient } from '@goutatou/whapi'
import { createSupabaseServer } from '@/lib/supabase/server'
import { assertPlan } from '@/lib/premium'
// Import relatif (et non `@/lib/...`) : `validateImagePath` est réutilisé tel quel depuis le
// composer Chaîne — même garde-fou que l'upload direct chaine/composer.tsx.
import { validateImagePath } from '../chaine/shared'
// loadChannelToken : même helper que chaine/actions.ts (décrypte le token du canal — jamais
// transmis au client), réutilisé tel quel pour le dépouillement (Task SV4).
import { loadChannelToken } from '../chaine/channel-token'
import { normalizeSurfaces, validatePollOptions, validateSurfaces, type PollSurface } from './shared'

const VALID_SURFACES: PollSurface[] = ['channel', 'group', 'status_teaser']

function isPollSurface(value: string): value is PollSurface {
  return (VALID_SURFACES as string[]).includes(value)
}

/** Garde membre + plan Pro (sondages = Pro, comme chaîne/statuts). */
async function myRestaurant() {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  const restaurantId = data.restaurant_id as string
  await assertPlan(supabase, restaurantId, ['pro', 'premium'])
  return { supabase, restaurantId }
}

export async function createPoll(formData: FormData) {
  const { supabase, restaurantId } = await myRestaurant()

  const question = String(formData.get('question') ?? '').trim()
  const rawOptions = formData.getAll('options').map((o) => String(o).trim())
  const pollResult = validatePollOptions(question, rawOptions)
  if (!pollResult.ok) throw new Error(pollResult.error)
  const { options } = pollResult

  const isQuiz = String(formData.get('quiz') ?? '') === 'on'
  let quizCorrect: number | null = null
  if (isQuiz) {
    const raw = String(formData.get('quiz_correct') ?? '')
    const idx = Number.parseInt(raw, 10)
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      throw new Error('Sélectionnez la bonne réponse du quiz.')
    }
    quizCorrect = idx
  }

  const rawSurfaces = formData.getAll('surfaces').map((s) => String(s)).filter(isPollSurface)
  // normalizeSurfaces re-vérifiée côté serveur : garde-fou décisif (« le vote a lieu sur la
  // chaîne ») même si le client a été contourné (case Chaîne désactivée/absente du formulaire).
  const surfaces = normalizeSurfaces(rawSurfaces)
  const surfaceError = validateSurfaces(surfaces)
  if (surfaceError) throw new Error(surfaceError)

  if (surfaces.includes('channel')) {
    const { data: resto } = await supabase
      .from('restaurants')
      .select('wa_channel_id')
      .eq('id', restaurantId)
      .single()
    if (!resto?.wa_channel_id) throw new Error('Créez d’abord votre chaîne WhatsApp.')
  }

  let teaserImageUrl: string | null = null
  if (surfaces.includes('status_teaser')) {
    const teaserImagePath = String(formData.get('teaser_image_path') ?? '').trim()
    if (teaserImagePath) {
      const pathError = validateImagePath(teaserImagePath, restaurantId)
      if (pathError) throw new Error(pathError)
      teaserImageUrl = supabase.storage.from('status-media').getPublicUrl(teaserImagePath).data.publicUrl
    }
  }

  const { error } = await supabase.from('polls').insert({
    restaurant_id: restaurantId,
    question,
    options,
    quiz_correct: quizCorrect,
    surfaces,
    teaser_image_url: teaserImageUrl,
    // target conservé pour compat (contrainte CHECK existante) : valeur neutre, le pilotage réel
    // se fait via `surfaces` (cf. migration 0027 + poll-worker multi-surfaces).
    target: 'channel',
    status: 'queued',
  })
  if (error) throw new Error('Impossible d’envoyer le sondage. Réessayez.')

  revalidatePath('/app/marketing/sondages')
}

export type PollSurfaceResult =
  | { options: Array<{ label: string; count: number }>; total: number }
  | { error: string }

export interface PollResultsPayload {
  channel?: PollSurfaceResult
  group?: PollSurfaceResult
}

const CHANNEL_TOKEN_ERROR = 'La chaîne n’est pas disponible sur ce canal.'

/**
 * Dépouillement à la demande d'un sondage natif (Task SV4). Multi-tenant strict : le poll est
 * chargé filtré par `restaurant_id = <restaurant du membre courant>`, un membre ne peut donc
 * jamais lire les résultats d'un sondage d'un autre restaurant même en connaissant son id. Ne lit
 * QUE `channel_message_id`/`group_message_id` — le `status_teaser` n'a pas de vote natif propre
 * (c'est une annonce, cf. Global Constraints du plan), il n'apparaît donc jamais dans le payload.
 * Aucune exception non gérée ne doit remonter au client : chaque appel whapi est capturé
 * individuellement par surface et transformé en état d'erreur FR affichable.
 */
export async function getPollResults(pollId: string): Promise<PollResultsPayload> {
  const { supabase, restaurantId } = await myRestaurant()

  const { data: poll, error } = await supabase
    .from('polls')
    .select('id, channel_message_id, group_message_id')
    .eq('id', pollId)
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  if (error || !poll) throw new Error('Sondage introuvable.')

  const channelMessageId = poll.channel_message_id as string | null
  const groupMessageId = poll.group_message_id as string | null
  if (!channelMessageId && !groupMessageId) return {}

  let token: string
  try {
    token = await loadChannelToken(supabase, restaurantId)
  } catch {
    const payload: PollResultsPayload = {}
    if (channelMessageId) payload.channel = { error: CHANNEL_TOKEN_ERROR }
    if (groupMessageId) payload.group = { error: CHANNEL_TOKEN_ERROR }
    return payload
  }

  const whapi = new WhapiClient(token)
  const payload: PollResultsPayload = {}

  if (channelMessageId) {
    try {
      payload.channel = await whapi.readPollResults(channelMessageId)
    } catch {
      payload.channel = { error: 'Impossible de lire les résultats de la chaîne.' }
    }
  }
  if (groupMessageId) {
    try {
      payload.group = await whapi.readPollResults(groupMessageId)
    } catch {
      payload.group = { error: 'Impossible de lire les résultats du groupe.' }
    }
  }

  return payload
}
