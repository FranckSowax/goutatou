// Contrat partagé du Studio Statuts : constantes de style + validation pure
// des cartes du composer. Aucune dépendance Supabase/React ici afin de
// rester utilisable côté client (composer/preview) ET côté serveur
// (actions.ts), et testable sans mock.

export type StatusCardKind = 'text' | 'image' | 'video'
export type StatusAudience = 'all' | 'optin'
export type StatusPublishMode = 'chain' | 'schedule' | 'draft'

export const MAX_CARDS = 10
export const MAX_VIDEO_MB = 16
export const MAX_IMAGE_MB = 8
export const CHAIN_STEP_MINUTES = 2
export const FONT_TYPE_MIN = 0
export const FONT_TYPE_MAX = 5

/** Extensions image acceptées pour le chemin de stockage (upload direct, accept="image/*"). */
export const IMAGE_EXTENSION_REGEX = /\.(jpe?g|png|gif|webp|heic|heif)$/i

export interface BgColorOption {
  value: string
  label: string
}

/** Palette de fonds pleine page façon statuts WhatsApp. */
export const BG_COLORS: BgColorOption[] = [
  { value: '#1F2C34', label: 'Anthracite' },
  { value: '#075E54', label: 'Vert nuit' },
  { value: '#128C7E', label: 'Teal' },
  { value: '#25D366', label: 'Vert clair' },
  { value: '#34495E', label: 'Ardoise' },
  { value: '#8E44AD', label: 'Violet' },
  { value: '#C0392B', label: 'Brique' },
  { value: '#E67E22', label: 'Orange' },
]

export interface CaptionColorOption {
  value: string
  label: string
}

export const CAPTION_COLORS: CaptionColorOption[] = [
  { value: '#FFFFFF', label: 'Clair' },
  { value: '#111111', label: 'Sombre' },
]

export interface FontStyleOption {
  index: number
  label: string
  className: string
}

/** Approximations CSS des polices proposées (0 à 5). */
export const FONT_STYLES: FontStyleOption[] = [
  { index: 0, label: 'Sans', className: 'font-sans font-medium' },
  { index: 1, label: 'Grasse', className: 'font-display font-extrabold uppercase tracking-tight' },
  { index: 2, label: 'Élégante', className: 'font-serif italic' },
  { index: 3, label: 'Machine', className: 'font-mono' },
  { index: 4, label: 'Manuscrite', className: 'font-display italic font-light tracking-wide' },
  { index: 5, label: 'Affiche', className: 'font-sans font-bold uppercase tracking-widest' },
]

export function fontStyleFor(fontType: number): FontStyleOption {
  return FONT_STYLES.find((f) => f.index === fontType) ?? FONT_STYLES[0]
}

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value)
}

export function isValidFontType(value: number): boolean {
  return Number.isInteger(value) && value >= FONT_TYPE_MIN && value <= FONT_TYPE_MAX
}

/** Carte brute telle que transmise par le composer (client). */
export interface RawStatusCard {
  kind: StatusCardKind
  content: string
  mediaUrl?: string | null
  mediaPath?: string | null
  bgColor: string
  captionColor: string
  fontType: number
  audience: StatusAudience
  scheduledAt?: string | null
}

export interface ValidatedStatusCard {
  kind: StatusCardKind
  content: string
  mediaUrl: string | null
  mediaPath: string | null
  bgColor: string
  captionColor: string
  fontType: number
  audience: StatusAudience
  scheduledAt: string | null
}

export type ValidateCardResult =
  | { ok: true; card: ValidatedStatusCard }
  | { ok: false; error: string }

/**
 * Validation pure d'une carte. `restaurantId` sert uniquement à vérifier le
 * préfixe du chemin de stockage image/vidéo (upload direct navigateur→bucket
 * pour les deux types de média) — la résolution de l'URL publique reste
 * faite côté action (accès Supabase).
 */
export function validateCard(
  raw: RawStatusCard,
  ctx: { restaurantId: string; isPremium: boolean },
): ValidateCardResult {
  if (raw.kind !== 'text' && raw.kind !== 'image' && raw.kind !== 'video') {
    return { ok: false, error: 'Type de carte invalide.' }
  }
  const content = raw.content.trim()
  if (!content) return { ok: false, error: 'Chaque carte doit avoir un contenu.' }

  if (!isHexColor(raw.bgColor)) return { ok: false, error: 'Couleur de fond invalide.' }
  if (!isHexColor(raw.captionColor)) return { ok: false, error: 'Couleur de légende invalide.' }
  if (!isValidFontType(raw.fontType)) return { ok: false, error: 'Police invalide.' }
  if (raw.audience !== 'all' && raw.audience !== 'optin') {
    return { ok: false, error: 'Audience invalide.' }
  }
  if (raw.audience === 'optin' && !ctx.isPremium) {
    return { ok: false, error: 'Le ciblage « Clients opt-in » est réservé au plan Premium.' }
  }

  let mediaUrl: string | null = null
  let mediaPath: string | null = null

  if (raw.kind === 'image') {
    mediaPath = (raw.mediaPath ?? '').trim() || null
    if (!mediaPath) return { ok: false, error: 'Ajoutez une image pour cette carte.' }
    if (!mediaPath.startsWith(`${ctx.restaurantId}/`)) {
      return { ok: false, error: 'Chemin image invalide.' }
    }
    if (!IMAGE_EXTENSION_REGEX.test(mediaPath)) {
      return { ok: false, error: "Format d'image non supporté." }
    }
  }
  if (raw.kind === 'video') {
    mediaPath = (raw.mediaPath ?? '').trim() || null
    if (!mediaPath) return { ok: false, error: 'Ajoutez une vidéo pour cette carte.' }
    if (!mediaPath.startsWith(`${ctx.restaurantId}/`)) {
      return { ok: false, error: 'Chemin vidéo invalide.' }
    }
    if (!/\.mp4$/i.test(mediaPath)) {
      return { ok: false, error: 'La vidéo doit être au format mp4.' }
    }
  }

  return {
    ok: true,
    card: {
      kind: raw.kind,
      content,
      mediaUrl,
      mediaPath,
      bgColor: raw.bgColor,
      captionColor: raw.captionColor,
      fontType: raw.fontType,
      audience: raw.audience,
      scheduledAt: raw.scheduledAt ?? null,
    },
  }
}

/** Calcule le `scheduled_at` (ISO) d'une carte selon le mode de publication. */
export function computeScheduledAt(
  mode: StatusPublishMode,
  index: number,
  perCardScheduledAt: string | null,
  nowMs: number,
): string | null {
  if (mode === 'draft') return null
  if (mode === 'chain') return new Date(nowMs + index * CHAIN_STEP_MINUTES * 60_000).toISOString()
  // mode === 'schedule'
  if (!perCardScheduledAt || !perCardScheduledAt.trim()) return null
  const d = new Date(perCardScheduledAt)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

/** État de la ligne `statuses` selon le mode de publication et la position. */
export function computeState(mode: StatusPublishMode, index: number): 'draft' | 'scheduled' | 'posting' {
  if (mode === 'draft') return 'draft'
  if (mode === 'chain' && index === 0) return 'posting'
  return 'scheduled'
}

// --- Statuts Auto (premium) : validation pure des créneaux/quota ---------

export const AUTO_STATUS_MAX_TIMES = 2
export const AUTO_STATUS_COUNT_MIN = 1
export const AUTO_STATUS_COUNT_MAX = 3
export const AUTO_STATUS_TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/

export type ValidateAutoStatusTimesResult = { ok: true; times: string[] } | { ok: false; error: string }

/**
 * Valide la liste de créneaux HH:MM (Africa/Libreville, cf. spec) : 1 à 2
 * entrées, format HH:MM (00-23 / 00-59), sans doublon. Les entrées vides
 * (second créneau non renseigné) sont ignorées avant validation.
 */
export function validateAutoStatusTimes(times: string[]): ValidateAutoStatusTimesResult {
  const cleaned = times.map((t) => t.trim()).filter((t) => t !== '')
  if (cleaned.length === 0) return { ok: false, error: 'Choisissez au moins un créneau.' }
  if (cleaned.length > AUTO_STATUS_MAX_TIMES) {
    return { ok: false, error: `Limitez-vous à ${AUTO_STATUS_MAX_TIMES} créneaux.` }
  }
  for (const t of cleaned) {
    if (!AUTO_STATUS_TIME_REGEX.test(t)) {
      return { ok: false, error: `Créneau invalide : « ${t} » (format HH:MM).` }
    }
  }
  if (new Set(cleaned).size !== cleaned.length) {
    return { ok: false, error: 'Les créneaux doivent être différents.' }
  }
  return { ok: true, times: cleaned }
}

/** Nombre de statuts générés par créneau : entier entre 1 et 3. */
export function validateAutoStatusCount(count: number): boolean {
  return Number.isInteger(count) && count >= AUTO_STATUS_COUNT_MIN && count <= AUTO_STATUS_COUNT_MAX
}

// --- Statuts Auto (premium) : validation avant publication ---------------

/** Mode de validation avant publication d'un statut auto (cf. restaurants.auto_status_validation). */
export type AutoStatusValidationMode = 'none' | 'manager' | 'group'

export const AUTO_STATUS_VALIDATION_MODES: AutoStatusValidationMode[] = ['none', 'manager', 'group']

export function isAutoStatusValidationMode(value: string): value is AutoStatusValidationMode {
  return (AUTO_STATUS_VALIDATION_MODES as string[]).includes(value)
}

/** Numéro E.164 permissif : « + » optionnel en tête, 8 à 15 chiffres. */
export const MANAGER_PHONE_REGEX = /^\+?\d{8,15}$/

export type ValidateManagerPhoneResult = { ok: true; phone: string } | { ok: false; error: string }

/**
 * Valide le numéro du gérant validateur (requis quand `validation ===
 * 'manager'`) : trim, puis format permissif (chiffres + « + » optionnel,
 * 8 à 15 chiffres — pas de validation stricte du plan de numérotation, cf.
 * design §Web). Vide → erreur dédiée (distincte du format invalide) pour un
 * message plus actionnable côté formulaire.
 */
export function validateManagerPhone(raw: string): ValidateManagerPhoneResult {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: false, error: 'Renseignez le numéro du gérant.' }
  if (!MANAGER_PHONE_REGEX.test(trimmed)) {
    return { ok: false, error: 'Numéro du gérant invalide.' }
  }
  return { ok: true, phone: trimmed }
}

// --- Historique (board.tsx) : filtre par état + pagination pure ----------

/** Filtre d'état proposé dans l'historique. 'all' n'exclut aucun état (y compris posting/canceled). */
export type StatusFilterState = 'all' | 'draft' | 'scheduled' | 'posted' | 'failed'

export const STATUS_FILTER_OPTIONS: { value: StatusFilterState; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'draft', label: 'Brouillon' },
  { value: 'scheduled', label: 'Programmé' },
  { value: 'posted', label: 'Publié' },
  { value: 'failed', label: 'Échec' },
]

export const STATUS_PAGE_SIZE = 8

/** Filtre pur une liste de statuts par état ; 'all' renvoie la liste telle quelle. */
export function filterStatusesByState<T extends { state: string }>(
  rows: T[],
  filter: StatusFilterState,
): T[] {
  if (filter === 'all') return rows
  return rows.filter((r) => r.state === filter)
}

export interface PaginateResult<T> {
  items: T[]
  /** Page courante, toujours dans [1, pageCount] (recadrée si hors bornes). */
  page: number
  pageCount: number
  total: number
}

/**
 * Pagination pure côté client sur une liste déjà chargée. `page` hors bornes
 * (ex : filtre réduisant le total) est recadrée sur la dernière page valide,
 * jamais moins de 1.
 */
export function paginate<T>(rows: T[], page: number, pageSize: number = STATUS_PAGE_SIZE): PaginateResult<T> {
  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const clampedPage = Math.min(Math.max(1, page), pageCount)
  const start = (clampedPage - 1) * pageSize
  return { items: rows.slice(start, start + pageSize), page: clampedPage, pageCount, total }
}
