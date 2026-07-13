import { describe, expect, it } from 'vitest'
import {
  BG_COLORS,
  CAPTION_COLORS,
  FONT_STYLES,
  MAX_CARDS,
  STATUS_FILTER_OPTIONS,
  computeScheduledAt,
  computeState,
  filterStatusesByState,
  fontStyleFor,
  isHexColor,
  isValidFontType,
  paginate,
  isAutoStatusValidationMode,
  validateAutoStatusCount,
  validateAutoStatusTimes,
  validateCard,
  validateManagerPhone,
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
    const res = validateCard(baseCard({ kind: 'image', mediaPath: '' }), { restaurantId: RID, isPremium: false })
    expect(res.ok).toBe(false)
  })
  it('carte image exige un chemin préfixé par le restaurant (upload direct, comme la vidéo)', () => {
    const wrongPrefix = validateCard(
      baseCard({ kind: 'image', mediaPath: 'autre-resto/x.jpg' }),
      { restaurantId: RID, isPremium: false },
    )
    expect(wrongPrefix.ok).toBe(false)

    const unsupportedExt = validateCard(
      baseCard({ kind: 'image', mediaPath: `${RID}/x.pdf` }),
      { restaurantId: RID, isPremium: false },
    )
    expect(unsupportedExt.ok).toBe(false)

    const ok = validateCard(
      baseCard({ kind: 'image', mediaPath: `${RID}/x.jpg` }),
      { restaurantId: RID, isPremium: false },
    )
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.card.mediaPath).toBe(`${RID}/x.jpg`)
      expect(ok.card.mediaUrl).toBeNull()
    }
  })
  it('carte image accepte les extensions courantes (png, webp, gif, heic)', () => {
    for (const ext of ['png', 'webp', 'gif', 'heic', 'jpeg']) {
      const res = validateCard(
        baseCard({ kind: 'image', mediaPath: `${RID}/x.${ext}` }),
        { restaurantId: RID, isPremium: false },
      )
      expect(res.ok, `extension .${ext} devrait être acceptée`).toBe(true)
    }
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

describe('isAutoStatusValidationMode', () => {
  it('accepte none/manager/group', () => {
    expect(isAutoStatusValidationMode('none')).toBe(true)
    expect(isAutoStatusValidationMode('manager')).toBe(true)
    expect(isAutoStatusValidationMode('group')).toBe(true)
  })
  it('rejette toute autre valeur', () => {
    expect(isAutoStatusValidationMode('')).toBe(false)
    expect(isAutoStatusValidationMode('admin')).toBe(false)
    expect(isAutoStatusValidationMode('Manager')).toBe(false)
  })
})

describe('validateManagerPhone', () => {
  it('accepte un numéro E.164 avec +', () => {
    const res = validateManagerPhone('+24107123456')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.phone).toBe('+24107123456')
  })
  it('accepte un numéro sans + (chiffres seuls)', () => {
    expect(validateManagerPhone('24107123456').ok).toBe(true)
  })
  it('trim les espaces avant validation', () => {
    const res = validateManagerPhone('  +24107123456  ')
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.phone).toBe('+24107123456')
  })
  it('rejette une chaîne vide avec un message dédié', () => {
    const res = validateManagerPhone('   ')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('Renseignez le numéro du gérant.')
  })
  it('rejette un numéro trop court (< 8 chiffres)', () => {
    const res = validateManagerPhone('1234567')
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe('Numéro du gérant invalide.')
  })
  it('rejette un numéro trop long (> 15 chiffres)', () => {
    expect(validateManagerPhone('1234567890123456').ok).toBe(false)
  })
  it('rejette les caractères non numériques', () => {
    expect(validateManagerPhone('+241 07 12 34 56').ok).toBe(false)
    expect(validateManagerPhone('abc12345678').ok).toBe(false)
  })
  it('accepte les bornes 8 et 15 chiffres', () => {
    expect(validateManagerPhone('12345678').ok).toBe(true)
    expect(validateManagerPhone('123456789012345').ok).toBe(true)
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

describe('filterStatusesByState (historique)', () => {
  const rows = [
    { id: '1', state: 'draft' },
    { id: '2', state: 'scheduled' },
    { id: '3', state: 'posted' },
    { id: '4', state: 'posted' },
    { id: '5', state: 'failed' },
    { id: '6', state: 'posting' },
    { id: '7', state: 'canceled' },
  ]
  it("'all' renvoie toutes les lignes, y compris posting/canceled", () => {
    expect(filterStatusesByState(rows, 'all')).toEqual(rows)
  })
  it('filtre exactement sur un état donné', () => {
    expect(filterStatusesByState(rows, 'posted').map((r) => r.id)).toEqual(['3', '4'])
    expect(filterStatusesByState(rows, 'draft').map((r) => r.id)).toEqual(['1'])
    expect(filterStatusesByState(rows, 'failed').map((r) => r.id)).toEqual(['5'])
  })
  it('renvoie une liste vide si aucun statut ne correspond', () => {
    expect(filterStatusesByState([{ id: '1', state: 'draft' }], 'failed')).toEqual([])
  })
  it('expose les 5 options de filtre attendues (Tous/Brouillon/Programmé/Publié/Échec)', () => {
    expect(STATUS_FILTER_OPTIONS.map((o) => o.value)).toEqual(['all', 'draft', 'scheduled', 'posted', 'failed'])
    expect(STATUS_FILTER_OPTIONS.map((o) => o.label)).toEqual(['Tous', 'Brouillon', 'Programmé', 'Publié', 'Échec'])
  })
})

describe('paginate (historique)', () => {
  const rows = Array.from({ length: 20 }, (_, i) => i)
  it('découpe en pages de taille donnée', () => {
    const res = paginate(rows, 1, 8)
    expect(res.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(res.page).toBe(1)
    expect(res.pageCount).toBe(3)
    expect(res.total).toBe(20)
  })
  it('renvoie la dernière page partielle', () => {
    const res = paginate(rows, 3, 8)
    expect(res.items).toEqual([16, 17, 18, 19])
  })
  it('recadre une page hors bornes (trop grande) sur la dernière page', () => {
    const res = paginate(rows, 99, 8)
    expect(res.page).toBe(3)
    expect(res.items).toEqual([16, 17, 18, 19])
  })
  it('recadre une page hors bornes (< 1) sur la page 1', () => {
    const res = paginate(rows, 0, 8)
    expect(res.page).toBe(1)
    expect(res.items).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
  it('gère une liste vide : 1 page, aucune ligne', () => {
    const res = paginate([], 1, 8)
    expect(res.pageCount).toBe(1)
    expect(res.page).toBe(1)
    expect(res.items).toEqual([])
  })
  it('utilise STATUS_PAGE_SIZE (8) par défaut', () => {
    const res = paginate(rows, 1)
    expect(res.items.length).toBe(8)
  })
})
