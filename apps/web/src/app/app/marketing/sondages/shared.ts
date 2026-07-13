// Contrat partagé du composer de sondages (multi-surfaces, spec
// docs/superpowers/specs/2026-07-13-sondages-v2-design.md) : constantes + validation pure
// (aucune dépendance Supabase/whapi ici) afin de rester testable sans mock, sur le même modèle
// que /app/marketing/chaine/shared.ts.

export type PollSurface = 'channel' | 'group' | 'status_teaser'

export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 12

/** Ordre d'affichage/normalisation stable des surfaces. */
export const POLL_SURFACES: PollSurface[] = ['channel', 'group', 'status_teaser']

export const SURFACE_LABELS: Record<PollSurface, string> = {
  channel: 'Chaîne WhatsApp',
  group: 'Groupe staff',
  status_teaser: 'Statut teaser',
}

export type ValidatePollResult =
  | { ok: true; question: string; options: string[] }
  | { ok: false; error: string }

/** Valide question + options d'un sondage (2 à 12 options non vides, distinctes). */
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

/**
 * Normalise la liste de surfaces cochées pour la création d'un sondage : le `status_teaser` est
 * un STATUT annonçant le sondage, jamais un vote natif (cf. Global Constraints) — cocher
 * `status_teaser` force donc l'ajout de `channel` (« le vote a lieu sur la chaîne »). Dé-doublonne
 * et renvoie un ordre stable (channel, group, status_teaser).
 */
export function normalizeSurfaces(surfaces: PollSurface[]): PollSurface[] {
  const set = new Set(surfaces)
  if (set.has('status_teaser')) set.add('channel')
  return POLL_SURFACES.filter((s) => set.has(s))
}

/** Au moins une surface doit être choisie pour publier le sondage. */
export function validateSurfaces(surfaces: PollSurface[]): string | null {
  if (surfaces.length === 0) return 'Choisissez au moins une surface.'
  return null
}
