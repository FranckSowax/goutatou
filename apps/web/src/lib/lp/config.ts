export interface LpTheme {
  primary: string
  bg: string
  text: string
  accent: string
  font: 'sans' | 'serif'
}

export interface LpHeroFrames {
  status: 'pending' | 'ready' | 'failed'
  sourceUrl: string
  baseUrl: string
  count: number
  width: number
  height: number
}

export interface LpConfig {
  published: boolean
  hero: {
    title: string
    subtitle: string
    mediaUrl: string | null
    mediaType: 'image' | 'video'
    frames: LpHeroFrames | null
  }
  about: { title: string; text: string } | null
  featuredIds: string[]
  infos: { address: string | null; hours: string[]; mapsUrl: string | null }
  theme: LpTheme
  effects: { grain: boolean; vignette: boolean }
  whatsappPhone: string | null
}

export const DEFAULT_THEME: LpTheme = {
  primary: '#E8590C',
  bg: '#0E0B08',
  text: '#F5EFE6',
  accent: '#F2B705',
  font: 'sans',
}

const HEX = /^#[0-9a-fA-F]{6}$/

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim() ? v : fallback
}
function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null
}
function obj(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function parseHeroFrames(v: unknown): LpHeroFrames | null {
  const f = obj(v)
  if (f.status !== 'pending' && f.status !== 'ready' && f.status !== 'failed') return null
  const sourceUrl = strOrNull(f.sourceUrl)
  if (!sourceUrl) return null
  const baseUrl = str(f.baseUrl, '')
  const count = num(f.count, 0)
  if (f.status === 'ready' && (!baseUrl || count <= 0)) return null
  return {
    status: f.status,
    sourceUrl,
    baseUrl,
    count,
    width: num(f.width, 0),
    height: num(f.height, 0),
  }
}

export function parseLpConfig(raw: unknown, restaurantName: string): LpConfig {
  const r = obj(raw)
  const hero = obj(r.hero)
  const about = obj(r.about)
  const infos = obj(r.infos)
  const theme = obj(r.theme)
  const effects = obj(r.effects)

  const aboutText = strOrNull(about.text)

  return {
    published: r.published === true,
    hero: {
      title: str(hero.title, restaurantName),
      subtitle: str(hero.subtitle, ''),
      mediaUrl: strOrNull(hero.mediaUrl),
      mediaType: hero.mediaType === 'video' ? 'video' : 'image',
      frames: parseHeroFrames(hero.frames),
    },
    about: aboutText ? { title: str(about.title, 'Notre histoire'), text: aboutText } : null,
    featuredIds: Array.isArray(r.featuredIds) ? r.featuredIds.filter((x): x is string => typeof x === 'string') : [],
    infos: {
      address: strOrNull(infos.address),
      hours: Array.isArray(infos.hours) ? infos.hours.filter((x): x is string => typeof x === 'string') : [],
      mapsUrl: strOrNull(infos.mapsUrl),
    },
    theme: {
      primary: HEX.test(String(theme.primary)) ? (theme.primary as string) : DEFAULT_THEME.primary,
      bg: HEX.test(String(theme.bg)) ? (theme.bg as string) : DEFAULT_THEME.bg,
      text: HEX.test(String(theme.text)) ? (theme.text as string) : DEFAULT_THEME.text,
      accent: HEX.test(String(theme.accent)) ? (theme.accent as string) : DEFAULT_THEME.accent,
      font: theme.font === 'serif' ? 'serif' : 'sans',
    },
    effects: { grain: effects.grain !== false, vignette: effects.vignette !== false },
    whatsappPhone: strOrNull(r.whatsappPhone),
  }
}
