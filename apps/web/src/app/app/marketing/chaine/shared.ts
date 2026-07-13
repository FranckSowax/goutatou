// Contrat partagé du composer de la Chaîne WhatsApp : constantes + validation
// pure (aucune dépendance Supabase/whapi ici) afin de rester testable sans
// mock, sur le même modèle que /app/marketing/statuts/shared.ts.

export type ChannelPostType = 'text' | 'image' | 'video' | 'album' | 'poll'

export const MAX_VIDEO_MB = 16
export const MAX_CATALOG_ITEMS = 10
export const CATALOG_THROTTLE_MS = 2000
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 12
export const HISTORY_COUNT = 20
export const HISTORY_PREVIEW_MAX_CHARS = 140

/**
 * Valide le chemin de stockage d'une vidéo uploadée en DIRECT
 * navigateur→bucket `status-media` (jamais de Server Action pour la vidéo —
 * même garde-fou que statuts/shared.ts `validateCard`). Retourne un message
 * d'erreur FR, ou `null` si le chemin est valide.
 */
export function validateVideoPath(mediaPath: string, restaurantId: string): string | null {
  const path = mediaPath.trim()
  if (!path) return 'Ajoutez une vidéo.'
  if (!path.startsWith(`${restaurantId}/`)) return 'Chemin vidéo invalide.'
  if (!/\.mp4$/i.test(path)) return 'La vidéo doit être au format mp4.'
  return null
}

export type ValidatePollResult =
  | { ok: true; question: string; options: string[] }
  | { ok: false; error: string }

/** Valide question + options d'un sondage chaîne (2 à 12 options non vides, distinctes). */
export function validatePollOptions(question: string, rawOptions: string[]): ValidatePollResult {
  const q = question.trim()
  if (!q) return { ok: false, error: 'Écrivez une question.' }
  const options = rawOptions.map((o) => o.trim()).filter(Boolean)
  if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) {
    return { ok: false, error: `Ajoutez entre ${POLL_MIN_OPTIONS} et ${POLL_MAX_OPTIONS} options non vides.` }
  }
  if (new Set(options).size !== options.length) {
    return { ok: false, error: 'Les options doivent être différentes les unes des autres.' }
  }
  return { ok: true, question: q, options }
}

/** Légende standard d'un plat publié en album catalogue. */
export function formatDishCaption(name: string, price: number): string {
  return `${name} — ${price} FCFA`
}

/** Aperçu FR d'un message d'historique de chaîne (texte tronqué ou pastille média). */
export function formatHistoryPreview(msg: { type?: string; text?: string; caption?: string }): string {
  if (msg.type === 'image') return '📷 Photo'
  if (msg.type === 'video') return '🎬 Vidéo'
  if (msg.type === 'poll') return '📊 Sondage'
  const body = (msg.text ?? msg.caption ?? '').trim()
  if (body) {
    return body.length > HISTORY_PREVIEW_MAX_CHARS
      ? `${body.slice(0, HISTORY_PREVIEW_MAX_CHARS)}…`
      : body
  }
  return 'Message'
}

/**
 * Date FR d'un message d'historique. Les timestamps Whapi sont en secondes
 * Unix (même convention que les webhooks entrants) ; on accepte aussi le
 * millisecondes par défense (`timestamp > 1e12`). Retourne une chaîne vide
 * si le timestamp est absent/invalide (l'appelant masque alors la date).
 */
export function formatHistoryDate(timestamp?: number): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) return ''
  const ms = timestamp > 1e12 ? timestamp : timestamp * 1000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
