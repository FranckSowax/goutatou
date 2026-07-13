// Contrat partagé du composer de la Chaîne WhatsApp : constantes + validation
// pure (aucune dépendance Supabase/whapi ici) afin de rester testable sans
// mock, sur le même modèle que /app/marketing/statuts/shared.ts.

// Import relatif (et non `@/lib/...`) : ce fichier est chargé tel quel par
// vitest (pas d'alias de résolution configuré côté vitest.config.ts, cf.
// pattern des autres modules `shared.ts` testés sans mock).
import { buildWaLink } from '../../../../lib/lp/wa'

export type ChannelPostType = 'text' | 'image' | 'video' | 'menu_card' | 'poll'

export const MAX_VIDEO_MB = 16
export const MAX_IMAGE_MB = 8
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

/**
 * Valide le chemin de stockage d'une image (carte menu) uploadée en DIRECT
 * navigateur→bucket `status-media` (jamais de Server Action pour le fichier —
 * même garde-fou que `validateVideoPath` ci-dessus). Retourne un message
 * d'erreur FR, ou `null` si le chemin est valide.
 */
export function validateImagePath(mediaPath: string, restaurantId: string): string | null {
  const path = mediaPath.trim()
  if (!path) return 'Ajoutez une image.'
  if (!path.startsWith(`${restaurantId}/`)) return 'Chemin image invalide.'
  if (!/\.(jpg|jpeg|png|webp)$/i.test(path)) return "L'image doit être au format jpg, png ou webp."
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

// --- Programmation de posts (channel_posts) -------------------------------

/**
 * Valide la date de programmation d'un post chaîne : doit être une date ISO
 * strictement future par rapport à `nowIso` (horloge injectée, jamais
 * `Date.now()` en dur côté action — cf. contrat repris des workers bot).
 * Retourne un message d'erreur FR, ou `null` si la date est valide.
 */
export function validateScheduledAt(iso: string, nowIso: string): string | null {
  const trimmed = iso.trim()
  if (!trimmed) return 'Choisissez une date future.'
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return 'Choisissez une date future.'
  const now = new Date(nowIso)
  if (d.getTime() <= now.getTime()) return 'Choisissez une date future.'
  return null
}

/**
 * Appende le CTA « Commander » (lien wa.me) à un corps/légende de post
 * chaîne, côté client, AVANT envoi (cf. Global Constraints — pas de vrais
 * boutons interactifs sur les chaînes WhatsApp). Aucun lien ajouté si
 * `contactPhone` est absent/vide (choix délibéré, pas d'erreur).
 */
export function appendOrderLink(content: string, contactPhone: string | null): string {
  const digits = (contactPhone ?? '').replace(/\D/g, '')
  if (!digits) return content
  return `${content}\n👉 Commander : ${buildWaLink(digits)}`
}

// --- Chaîne Auto (premium) : validation pure des créneaux/quota ----------

export const AUTO_CHANNEL_MAX_TIMES = 2
export const AUTO_CHANNEL_COUNT_MIN = 1
export const AUTO_CHANNEL_COUNT_MAX = 3
/** Format HH:MM (cf. spec CA2 — validation permissive, pas de bornes horaires strictes). */
export const AUTO_CHANNEL_TIME_REGEX = /^\d{2}:\d{2}$/

export type ValidateAutoChannelTimesResult = { ok: true; times: string[] } | { ok: false; error: string }

/**
 * Valide la liste de créneaux HH:MM de la Chaîne Auto : 1 à 2 entrées,
 * format `^\d{2}:\d{2}$`, sans doublon. Les entrées vides (second créneau
 * non renseigné) sont ignorées avant validation.
 */
export function validateAutoChannelTimes(times: string[]): ValidateAutoChannelTimesResult {
  const cleaned = times.map((t) => t.trim()).filter((t) => t !== '')
  if (cleaned.length === 0) return { ok: false, error: 'Choisissez au moins un créneau.' }
  if (cleaned.length > AUTO_CHANNEL_MAX_TIMES) {
    return { ok: false, error: `Limitez-vous à ${AUTO_CHANNEL_MAX_TIMES} créneaux.` }
  }
  for (const t of cleaned) {
    if (!AUTO_CHANNEL_TIME_REGEX.test(t)) {
      return { ok: false, error: `Créneau invalide : « ${t} » (format HH:MM).` }
    }
  }
  if (new Set(cleaned).size !== cleaned.length) {
    return { ok: false, error: 'Les créneaux doivent être différents.' }
  }
  return { ok: true, times: cleaned }
}

/** Nombre de posts générés par créneau : entier entre 1 et 3. */
export function validateAutoChannelCount(count: number): boolean {
  return Number.isInteger(count) && count >= AUTO_CHANNEL_COUNT_MIN && count <= AUTO_CHANNEL_COUNT_MAX
}
