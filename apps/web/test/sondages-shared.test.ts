import { describe, expect, it } from 'vitest'
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_SURFACES,
  SURFACE_LABELS,
  normalizeSurfaces,
  validatePollOptions,
  validateSurfaces,
} from '../src/app/app/marketing/sondages/shared'

describe('constants', () => {
  it('expose les bornes attendues', () => {
    expect(POLL_MIN_OPTIONS).toBe(2)
    expect(POLL_MAX_OPTIONS).toBe(12)
    expect(POLL_SURFACES).toEqual(['channel', 'group', 'status_teaser'])
  })
  it('expose un libellé FR par surface', () => {
    expect(SURFACE_LABELS.channel).toBe('Chaîne WhatsApp')
    expect(SURFACE_LABELS.group).toBe('Groupe staff')
    expect(SURFACE_LABELS.status_teaser).toBe('Statut teaser')
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

describe('normalizeSurfaces', () => {
  it('force l’ajout de channel quand status_teaser est présent', () => {
    expect(normalizeSurfaces(['status_teaser'])).toEqual(['channel', 'status_teaser'])
  })
  it('ne modifie pas une sélection sans status_teaser', () => {
    expect(normalizeSurfaces(['group'])).toEqual(['group'])
    expect(normalizeSurfaces(['channel', 'group'])).toEqual(['channel', 'group'])
  })
  it('dé-doublonne', () => {
    expect(normalizeSurfaces(['channel', 'channel', 'group'])).toEqual(['channel', 'group'])
  })
  it('renvoie un ordre stable (channel, group, status_teaser)', () => {
    expect(normalizeSurfaces(['status_teaser', 'group', 'channel'])).toEqual(['channel', 'group', 'status_teaser'])
    expect(normalizeSurfaces(['group', 'status_teaser'])).toEqual(['channel', 'group', 'status_teaser'])
  })
  it('renvoie un tableau vide si rien n’est sélectionné', () => {
    expect(normalizeSurfaces([])).toEqual([])
  })
})

describe('validateSurfaces', () => {
  it('rejette une sélection vide', () => {
    expect(validateSurfaces([])).toBe('Choisissez au moins une surface.')
  })
  it('accepte au moins une surface', () => {
    expect(validateSurfaces(['channel'])).toBeNull()
    expect(validateSurfaces(['group'])).toBeNull()
    expect(validateSurfaces(['channel', 'status_teaser'])).toBeNull()
  })
})
