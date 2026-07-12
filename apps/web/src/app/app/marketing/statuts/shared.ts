// Contrat partagé du Studio Statuts : constantes de style + validation pure
// des cartes du composer. Aucune dépendance Supabase/React ici afin de
// rester utilisable côté client (composer/preview) ET côté serveur
// (actions.ts), et testable sans mock.

export type StatusCardKind = 'text' | 'image' | 'video'
export type StatusAudience = 'all' | 'optin'
export type StatusPublishMode = 'chain' | 'schedule' | 'draft'

export const MAX_CARDS = 10
export const MAX_VIDEO_MB = 16
export const CHAIN_STEP_MINUTES = 2
export const FONT_TYPE_MIN = 0
export const FONT_TYPE_MAX = 5

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
 * préfixe du chemin de stockage vidéo (upload direct navigateur→bucket) —
 * la résolution de l'URL publique reste faite côté action (accès Supabase).
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
    mediaUrl = (raw.mediaUrl ?? '').trim() || null
    if (!mediaUrl) return { ok: false, error: 'Ajoutez une image pour cette carte.' }
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
