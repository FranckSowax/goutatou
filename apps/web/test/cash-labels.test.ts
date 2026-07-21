import { describe, it, expect } from 'vitest'
import { breakdownRows, differenceLabel, modeLabel, sourceLabel } from '../src/lib/cash-labels'

describe('libellés FR', () => {
  it('traduit les modes de retrait', () => {
    expect(modeLabel('sur_place')).toBe('🥡 À emporter')
    expect(modeLabel('drive')).toBe('🚗 Drive')
    expect(modeLabel('livraison')).toBe('🛵 Livraison')
  })
  it('traduit les canaux', () => {
    expect(sourceLabel('whatsapp')).toBe('WhatsApp')
    expect(sourceLabel('comptoir')).toBe('Comptoir')
    expect(sourceLabel('web')).toBe('Site')
  })
  it('retombe sur la clé brute pour une valeur inconnue', () => {
    expect(modeLabel('teleportation')).toBe('teleportation')
    expect(sourceLabel('sms')).toBe('sms')
  })
})

describe('breakdownRows', () => {
  it('trie du plus gros au plus petit et calcule les parts', () => {
    const rows = breakdownRows({ sur_place: 2500, drive: 7500 }, modeLabel)
    expect(rows.map((r) => r.key)).toEqual(['drive', 'sur_place'])
    expect(rows[0]).toMatchObject({ label: '🚗 Drive', amount: 7500, share: 75 })
    expect(rows[1].share).toBe(25)
  })
  it('écarte les montants nuls', () => {
    expect(breakdownRows({ drive: 0, web: 1000 }, sourceLabel).map((r) => r.key)).toEqual(['web'])
  })
  it('tolère une ventilation absente', () => {
    expect(breakdownRows(null, modeLabel)).toEqual([])
    expect(breakdownRows(undefined, modeLabel)).toEqual([])
  })
  it('reste stable à montants égaux (ordre alphabétique)', () => {
    const rows = breakdownRows({ web: 1000, comptoir: 1000 }, sourceLabel)
    expect(rows.map((r) => r.key)).toEqual(['comptoir', 'web'])
  })
})

describe('differenceLabel', () => {
  it('distingue manquant, excédent, caisse juste et non compté', () => {
    expect(differenceLabel(null)).toBe('Non compté')
    expect(differenceLabel(0)).toBe('Caisse juste')
    expect(differenceLabel(-500)).toBe('manquant')
    expect(differenceLabel(500)).toBe('excédent')
  })
})
