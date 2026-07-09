import { describe, expect, it } from 'vitest'
import { targetRotationDeg } from '../src/lib/wheel'

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
