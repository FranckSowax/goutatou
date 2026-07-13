import { describe, expect, it } from 'vitest'
import {
  AUTO_CHANNEL_COUNT_MAX,
  AUTO_CHANNEL_COUNT_MIN,
  AUTO_CHANNEL_MAX_TIMES,
  MAX_IMAGE_MB,
  MAX_VIDEO_MB,
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  appendOrderLink,
  formatHistoryDate,
  formatHistoryPreview,
  validateAutoChannelCount,
  validateAutoChannelTimes,
  validateImagePath,
  validatePollOptions,
  validateScheduledAt,
  validateVideoPath,
} from '../src/app/app/marketing/chaine/shared'

const RID = 'resto-1'

describe('constants', () => {
  it('expose les bornes attendues', () => {
    expect(MAX_VIDEO_MB).toBe(16)
    expect(MAX_IMAGE_MB).toBe(8)
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

describe('validateImagePath', () => {
  it('accepte un chemin restaurantId/uuid.jpg', () => {
    expect(validateImagePath(`${RID}/abc-123.jpg`, RID)).toBeNull()
  })
  it('accepte les extensions jpeg, png et webp', () => {
    expect(validateImagePath(`${RID}/a.jpeg`, RID)).toBeNull()
    expect(validateImagePath(`${RID}/a.png`, RID)).toBeNull()
    expect(validateImagePath(`${RID}/a.webp`, RID)).toBeNull()
  })
  it('rejette un chemin vide', () => {
    expect(validateImagePath('', RID)).toBe('Ajoutez une image.')
  })
  it("rejette un chemin d'un autre restaurant", () => {
    expect(validateImagePath('resto-2/abc.jpg', RID)).toBe('Chemin image invalide.')
  })
  it('rejette une extension non image', () => {
    expect(validateImagePath(`${RID}/abc.mp4`, RID)).toBe("L'image doit être au format jpg, png ou webp.")
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

describe('validateScheduledAt', () => {
  const NOW = '2026-07-13T12:00:00.000Z'
  it('accepte une date future', () => {
    expect(validateScheduledAt('2026-07-13T13:00:00.000Z', NOW)).toBeNull()
  })
  it('rejette une date vide', () => {
    expect(validateScheduledAt('', NOW)).toBe('Choisissez une date future.')
  })
  it('rejette une date invalide', () => {
    expect(validateScheduledAt('pas-une-date', NOW)).toBe('Choisissez une date future.')
  })
  it('rejette une date passée', () => {
    expect(validateScheduledAt('2026-07-13T11:00:00.000Z', NOW)).toBe('Choisissez une date future.')
  })
  it('rejette une date égale à maintenant', () => {
    expect(validateScheduledAt(NOW, NOW)).toBe('Choisissez une date future.')
  })
})

describe('appendOrderLink', () => {
  it('appende le lien wa.me si contactPhone est renseigné', () => {
    const res = appendOrderLink('Notre plat du jour', '074123456')
    expect(res).toBe('Notre plat du jour\n👉 Commander : https://wa.me/074123456')
  })
  it('ne modifie pas le contenu si contactPhone est vide', () => {
    expect(appendOrderLink('Notre plat du jour', '')).toBe('Notre plat du jour')
  })
  it('ne modifie pas le contenu si contactPhone est null', () => {
    expect(appendOrderLink('Notre plat du jour', null)).toBe('Notre plat du jour')
  })
  it('ne garde que les chiffres du numéro', () => {
    const res = appendOrderLink('Corps', '+241 74 12 34 56')
    expect(res).toBe('Corps\n👉 Commander : https://wa.me/24174123456')
  })
})

describe('validateAutoChannelTimes', () => {
  it('expose la borne attendue', () => {
    expect(AUTO_CHANNEL_MAX_TIMES).toBe(2)
  })
  it('accepte 1 à 2 créneaux HH:MM valides', () => {
    expect(validateAutoChannelTimes(['11:30', ''])).toEqual({ ok: true, times: ['11:30'] })
    expect(validateAutoChannelTimes(['11:30', '18:30'])).toEqual({ ok: true, times: ['11:30', '18:30'] })
  })
  it('rejette une liste vide', () => {
    expect(validateAutoChannelTimes(['', '']).ok).toBe(false)
  })
  it('rejette plus de 2 créneaux', () => {
    expect(validateAutoChannelTimes(['08:00', '12:00', '18:00']).ok).toBe(false)
  })
  it('rejette un format invalide', () => {
    expect(validateAutoChannelTimes(['midi']).ok).toBe(false)
    expect(validateAutoChannelTimes(['8:00']).ok).toBe(false)
  })
  it('rejette des créneaux dupliqués', () => {
    expect(validateAutoChannelTimes(['11:30', '11:30']).ok).toBe(false)
  })
})

describe('validateAutoChannelCount', () => {
  it('expose les bornes attendues', () => {
    expect(AUTO_CHANNEL_COUNT_MIN).toBe(1)
    expect(AUTO_CHANNEL_COUNT_MAX).toBe(3)
  })
  it('accepte 1 à 3', () => {
    expect(validateAutoChannelCount(1)).toBe(true)
    expect(validateAutoChannelCount(2)).toBe(true)
    expect(validateAutoChannelCount(3)).toBe(true)
  })
  it('rejette hors bornes ou non entier', () => {
    expect(validateAutoChannelCount(0)).toBe(false)
    expect(validateAutoChannelCount(4)).toBe(false)
    expect(validateAutoChannelCount(1.5)).toBe(false)
    expect(validateAutoChannelCount(Number.NaN)).toBe(false)
  })
})
