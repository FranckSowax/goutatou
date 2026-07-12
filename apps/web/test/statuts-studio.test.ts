import { describe, expect, it } from 'vitest'
import {
  BG_COLORS,
  CAPTION_COLORS,
  FONT_STYLES,
  MAX_CARDS,
  computeScheduledAt,
  computeState,
  fontStyleFor,
  isHexColor,
  isValidFontType,
  validateAutoStatusCount,
  validateAutoStatusTimes,
  validateCard,
  type RawStatusCard,
} from '../src/app/app/marketing/statuts/shared'
import {
  AUTO_STATUS_CAPTION_TEMPLATE_COUNT,
  buildStatusCaptionPreview,
} from '../src/app/app/marketing/statuts/auto-caption-preview'

const RID = 'resto-1'

function baseCard(overrides: Partial<RawStatusCard> = {}): RawStatusCard {
  return {
    kind: 'text',
    content: 'Bonjour !',
    bgColor: BG_COLORS[0].value,
    captionColor: CAPTION_COLORS[0].value,
    fontType: 0,
    audience: 'all',
    scheduledAt: null,
    ...overrides,
  }
}

describe('style constants', () => {
  it('expose 8 fonds et 6 polices', () => {
    expect(BG_COLORS.length).toBe(8)
    expect(FONT_STYLES.length).toBe(6)
    expect(CAPTION_COLORS.length).toBe(2)
  })
  it('fontStyleFor retombe sur la police 0 si index inconnu', () => {
    expect(fontStyleFor(99).index).toBe(0)
    expect(fontStyleFor(3).label).toBe('Machine')
  })
})

describe('isHexColor / isValidFontType', () => {
  it('valide les couleurs hex à 6 chiffres', () => {
    expect(isHexColor('#1F2C34')).toBe(true)
    expect(isHexColor('1F2C34')).toBe(false)
    expect(isHexColor('#fff')).toBe(false)
    expect(isHexColor('red')).toBe(false)
  })
  it('valide font_type entre 0 et 5', () => {
    expect(isValidFontType(0)).toBe(true)
    expect(isValidFontType(5)).toBe(true)
    expect(isValidFontType(6)).toBe(false)
    expect(isValidFontType(-1)).toBe(false)
    expect(isValidFontType(2.5)).toBe(false)
  })
})

describe('validateCard', () => {
  it('accepte une carte texte valide', () => {
    const res = validateCard(baseCard(), { restaurantId: RID, isPremium: false })
    expect(res.ok).toBe(true)
  })
  it('rejette un contenu vide', () => {
    const res = validateCard(baseCard({ content: '   ' }), { restaurantId: RID, isPremium: false })
    expect(res.ok).toBe(false)
  })
  it('rejette une couleur invalide', () => {
    const res = validateCard(baseCard({ bgColor: 'red' }), { restaurantId: RID, isPremium: false })
    expect(res.ok).toBe(false)
  })
  it('rejette audience optin sans premium', () => {
    const res = validateCard(baseCard({ audience: 'optin' }), { restaurantId: RID, isPremium: false })
    expect(res.ok).toBe(false)
  })
  it('accepte audience optin avec premium', () => {
    const res = validateCard(baseCard({ audience: 'optin' }), { restaurantId: RID, isPremium: true })
    expect(res.ok).toBe(true)
  })
  it('carte image sans média est rejetée', () => {
    const res = validateCard(baseCard({ kind: 'image', mediaUrl: '' }), { restaurantId: RID, isPremium: false })
    expect(res.ok).toBe(false)
  })
  it('carte image avec URL est acceptée', () => {
    const res = validateCard(
      baseCard({ kind: 'image', mediaUrl: 'https://example.com/x.jpg' }),
      { restaurantId: RID, isPremium: false },
    )
    expect(res.ok).toBe(true)
  })
  it('carte vidéo exige un chemin préfixé par le restaurant', () => {
    const wrongPrefix = validateCard(
      baseCard({ kind: 'video', mediaPath: 'autre-resto/a.mp4' }),
      { restaurantId: RID, isPremium: false },
    )
    expect(wrongPrefix.ok).toBe(false)

    const notMp4 = validateCard(
      baseCard({ kind: 'video', mediaPath: `${RID}/a.mov` }),
      { restaurantId: RID, isPremium: false },
    )
    expect(notMp4.ok).toBe(false)

    const ok = validateCard(
      baseCard({ kind: 'video', mediaPath: `${RID}/a.mp4` }),
      { restaurantId: RID, isPremium: false },
    )
    expect(ok.ok).toBe(true)
  })
  it('rejette un type de carte inconnu', () => {
    // @ts-expect-error kind volontairement invalide pour le test
    const res = validateCard(baseCard({ kind: 'gif' }), { restaurantId: RID, isPremium: false })
    expect(res.ok).toBe(false)
  })
})

describe('computeState', () => {
  it('brouillon pour toutes les cartes en mode draft', () => {
    expect(computeState('draft', 0)).toBe('draft')
    expect(computeState('draft', 3)).toBe('draft')
  })
  it('la première carte en mode chain part immédiatement', () => {
    expect(computeState('chain', 0)).toBe('posting')
    expect(computeState('chain', 1)).toBe('scheduled')
  })
  it('toutes les cartes en mode schedule sont programmées', () => {
    expect(computeState('schedule', 0)).toBe('scheduled')
    expect(computeState('schedule', 4)).toBe('scheduled')
  })
})

describe('computeScheduledAt', () => {
  const now = Date.parse('2026-07-13T10:00:00.000Z')
  it('null en mode draft', () => {
    expect(computeScheduledAt('draft', 0, null, now)).toBeNull()
  })
  it('étage les cartes de 2 minutes en mode chain', () => {
    expect(computeScheduledAt('chain', 0, null, now)).toBe(new Date(now).toISOString())
    expect(computeScheduledAt('chain', 1, null, now)).toBe(new Date(now + 2 * 60_000).toISOString())
    expect(computeScheduledAt('chain', 2, null, now)).toBe(new Date(now + 4 * 60_000).toISOString())
  })
  it('utilise la date fournie en mode schedule', () => {
    const iso = '2026-07-14T09:00:00.000Z'
    expect(computeScheduledAt('schedule', 0, iso, now)).toBe(new Date(iso).toISOString())
  })
  it('null en mode schedule sans date', () => {
    expect(computeScheduledAt('schedule', 0, null, now)).toBeNull()
    expect(computeScheduledAt('schedule', 0, '  ', now)).toBeNull()
  })
})

it('MAX_CARDS est raisonnable', () => {
  expect(MAX_CARDS).toBe(10)
})

describe('validateAutoStatusTimes', () => {
  it('accepte un seul créneau valide', () => {
    const res = validateAutoStatusTimes(['11:30', ''])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.times).toEqual(['11:30'])
  })
  it('accepte deux créneaux valides et distincts', () => {
    const res = validateAutoStatusTimes(['11:30', '18:30'])
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.times).toEqual(['11:30', '18:30'])
  })
  it('rejette une liste vide', () => {
    expect(validateAutoStatusTimes(['', '']).ok).toBe(false)
  })
  it('rejette plus de deux créneaux', () => {
    expect(validateAutoStatusTimes(['08:00', '12:00', '18:00']).ok).toBe(false)
  })
  it('rejette un format invalide', () => {
    expect(validateAutoStatusTimes(['8:00']).ok).toBe(false)
    expect(validateAutoStatusTimes(['24:00']).ok).toBe(false)
    expect(validateAutoStatusTimes(['12:60']).ok).toBe(false)
    expect(validateAutoStatusTimes(['midi']).ok).toBe(false)
  })
  it('accepte les bornes 00:00 et 23:59', () => {
    expect(validateAutoStatusTimes(['00:00']).ok).toBe(true)
    expect(validateAutoStatusTimes(['23:59']).ok).toBe(true)
  })
  it('rejette deux créneaux identiques', () => {
    expect(validateAutoStatusTimes(['11:30', '11:30']).ok).toBe(false)
  })
})

describe('validateAutoStatusCount', () => {
  it('accepte 1, 2 et 3', () => {
    expect(validateAutoStatusCount(1)).toBe(true)
    expect(validateAutoStatusCount(2)).toBe(true)
    expect(validateAutoStatusCount(3)).toBe(true)
  })
  it('rejette 0, 4 et les non-entiers', () => {
    expect(validateAutoStatusCount(0)).toBe(false)
    expect(validateAutoStatusCount(4)).toBe(false)
    expect(validateAutoStatusCount(1.5)).toBe(false)
    expect(validateAutoStatusCount(Number.NaN)).toBe(false)
  })
})

describe('buildStatusCaptionPreview', () => {
  const dish = { name: 'Poulet DG', price: 5000 }
  it('inclut le nom du plat, le prix formaté et le CTA WhatsApp', () => {
    const caption = buildStatusCaptionPreview(dish, 0)
    expect(caption).toContain('Poulet DG')
    expect(caption).toContain('5 000 FCFA')
    expect(caption).toContain('Commandez-nous sur WhatsApp')
  })
  it('expose au moins 6 gabarits', () => {
    expect(AUTO_STATUS_CAPTION_TEMPLATE_COUNT).toBeGreaterThanOrEqual(6)
  })
  it('tourne sur les gabarits par modulo (y compris index négatif)', () => {
    const a = buildStatusCaptionPreview(dish, 0)
    const b = buildStatusCaptionPreview(dish, AUTO_STATUS_CAPTION_TEMPLATE_COUNT)
    expect(a).toBe(b)
    expect(() => buildStatusCaptionPreview(dish, -1)).not.toThrow()
  })
  it('produit des gabarits variés', () => {
    const captions = new Set(
      Array.from({ length: AUTO_STATUS_CAPTION_TEMPLATE_COUNT }, (_, i) => buildStatusCaptionPreview(dish, i)),
    )
    expect(captions.size).toBe(AUTO_STATUS_CAPTION_TEMPLATE_COUNT)
  })
})
