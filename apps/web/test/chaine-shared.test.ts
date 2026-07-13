import { describe, expect, it } from 'vitest'
import {
  CATALOG_THROTTLE_MS,
  MAX_CATALOG_ITEMS,
  MAX_VIDEO_MB,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  formatDishCaption,
  formatHistoryDate,
  formatHistoryPreview,
  validatePollOptions,
  validateVideoPath,
} from '../src/app/app/marketing/chaine/shared'

const RID = 'resto-1'

describe('constants', () => {
  it('expose les bornes attendues', () => {
    expect(MAX_VIDEO_MB).toBe(16)
    expect(MAX_CATALOG_ITEMS).toBe(10)
    expect(CATALOG_THROTTLE_MS).toBe(2000)
    expect(POLL_MIN_OPTIONS).toBe(2)
    expect(POLL_MAX_OPTIONS).toBe(12)
  })
})

describe('validateVideoPath', () => {
  it('accepte un chemin restaurantId/uuid.mp4', () => {
    expect(validateVideoPath(`${RID}/abc-123.mp4`, RID)).toBeNull()
  })
  it('rejette un chemin vide', () => {
    expect(validateVideoPath('', RID)).toBe('Ajoutez une vidéo.')
  })
  it("rejette un chemin d'un autre restaurant", () => {
    expect(validateVideoPath('resto-2/abc.mp4', RID)).toBe('Chemin vidéo invalide.')
  })
  it('rejette une extension non mp4', () => {
    expect(validateVideoPath(`${RID}/abc.mov`, RID)).toBe('La vidéo doit être au format mp4.')
  })
})

describe('validatePollOptions', () => {
  it('accepte 2 à 12 options non vides distinctes', () => {
    const res = validatePollOptions('Votre plat préféré ?', ['Poulet', 'Poisson'])
    expect(res).toEqual({ ok: true, question: 'Votre plat préféré ?', options: ['Poulet', 'Poisson'] })
  })
  it('rejette une question vide', () => {
    const res = validatePollOptions('  ', ['A', 'B'])
    expect(res).toEqual({ ok: false, error: 'Écrivez une question.' })
  })
  it('rejette moins de 2 options non vides', () => {
    const res = validatePollOptions('Q ?', ['Seule', ''])
    expect(res.ok).toBe(false)
  })
  it('rejette plus de 12 options', () => {
    const res = validatePollOptions('Q ?', Array.from({ length: 13 }, (_, i) => `Option ${i}`))
    expect(res.ok).toBe(false)
  })
  it('rejette des options dupliquées', () => {
    const res = validatePollOptions('Q ?', ['A', 'A'])
    expect(res).toEqual({ ok: false, error: 'Les options doivent être différentes les unes des autres.' })
  })
  it('ignore les options vides en trop avant de compter', () => {
    const res = validatePollOptions('Q ?', ['A', '', 'B', '  '])
    expect(res).toEqual({ ok: true, question: 'Q ?', options: ['A', 'B'] })
  })
})

describe('formatDishCaption', () => {
  it('formate "{nom} — {prix} FCFA"', () => {
    expect(formatDishCaption('Poulet braisé', 3500)).toBe('Poulet braisé — 3500 FCFA')
  })
})

describe('formatHistoryPreview', () => {
  it('pastille photo', () => {
    expect(formatHistoryPreview({ type: 'image' })).toBe('📷 Photo')
  })
  it('pastille vidéo', () => {
    expect(formatHistoryPreview({ type: 'video' })).toBe('🎬 Vidéo')
  })
  it('pastille sondage', () => {
    expect(formatHistoryPreview({ type: 'poll' })).toBe('📊 Sondage')
  })
  it('aperçu texte pour un message texte', () => {
    expect(formatHistoryPreview({ type: 'text', text: 'Promo du jour !' })).toBe('Promo du jour !')
  })
  it('retombe sur caption si text absent', () => {
    expect(formatHistoryPreview({ caption: 'Légende' })).toBe('Légende')
  })
  it('tronque un texte trop long', () => {
    const long = 'a'.repeat(200)
    const res = formatHistoryPreview({ text: long })
    expect(res.endsWith('…')).toBe(true)
    expect(res.length).toBe(141)
  })
  it('repli "Message" si rien à afficher', () => {
    expect(formatHistoryPreview({})).toBe('Message')
  })
})

describe('formatHistoryDate', () => {
  it('retourne une chaîne vide si timestamp absent/invalide', () => {
    expect(formatHistoryDate(undefined)).toBe('')
    expect(formatHistoryDate(Number.NaN)).toBe('')
  })
  it('formate un timestamp en secondes', () => {
    const res = formatHistoryDate(1_735_689_600) // 2025-01-01T00:00:00Z
    expect(res).toMatch(/2025/)
  })
})
