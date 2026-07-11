import { describe, expect, it } from 'vitest'
import { findSpinIndex, formatExpiryFr, nextRotationDeg, targetRotationDeg } from '../src/lib/wheel'

describe('targetRotationDeg', () => {
  it('aligne le secteur choisi en haut avec des tours complets', () => {
    // 4 secteurs de 90° ; secteur 0 centré en haut = 0° + tours
    expect(targetRotationDeg(0, 4, 5) % 360).toBe(0)
    // secteur 1 : il faut tourner de -90° (mod 360 = 270) pour l'amener en haut
    expect(targetRotationDeg(1, 4, 5) % 360).toBe(270)
  })
  it('ajoute les tours complets demandés', () => {
    expect(targetRotationDeg(0, 4, 5)).toBeGreaterThanOrEqual(5 * 360)
  })
})

describe('findSpinIndex', () => {
  const segments = [
    { kind: 'prize' as const, id: 'p1' },
    { kind: 'prize' as const, id: 'p2' },
    { kind: 'lose' as const },
    { kind: 'retry' as const },
  ]
  it('matche un gain par id de lot, pas par position', () => {
    expect(findSpinIndex(segments, 'prize', 'p2')).toBe(1)
  })
  it('trouve le segment perdu / rejouez par nature', () => {
    expect(findSpinIndex(segments, 'lose')).toBe(2)
    expect(findSpinIndex(segments, 'retry')).toBe(3)
  })
  it('retombe sur 0 si le segment attendu est introuvable', () => {
    expect(findSpinIndex(segments, 'prize', 'inconnu')).toBe(0)
    expect(findSpinIndex([{ kind: 'prize' as const, id: 'p1' }], 'retry')).toBe(0)
  })
})

describe('nextRotationDeg', () => {
  it('avance toujours vers l’avant (jamais en arrière) par rapport à la rotation précédente', () => {
    const first = nextRotationDeg(0, 90)
    expect(first).toBeGreaterThan(0)
    const second = nextRotationDeg(first, 45)
    expect(second).toBeGreaterThan(first)
  })
  it('ajoute au moins minExtraTurns tours pleins au-delà du tour courant', () => {
    const r = nextRotationDeg(370, 10, 6)
    // tour courant = 1 (370/360) ; au moins 6 tours de plus + alignement
    expect(r).toBe((1 + 6) * 360 + 10)
  })
})

describe('formatExpiryFr', () => {
  it('formate une date ISO en FR lisible', () => {
    expect(formatExpiryFr('2026-08-11T10:00:00.000Z')).toMatch(/août 2026/)
  })
})
