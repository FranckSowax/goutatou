import { describe, expect, it } from 'vitest'
import { normalizePhone } from '../src/lib/wheel-phone'

describe('normalizePhone', () => {
  it("'+241 05 52 65 22' -> '24105526522' (chiffres seuls, indicatif inclus)", () => {
    expect(normalizePhone('+241 05 52 65 22')).toBe('24105526522')
  })

  it("'06 12' -> null (moins de 8 chiffres)", () => {
    expect(normalizePhone('06 12')).toBeNull()
  })

  it('20 chiffres -> null (plus de 15 chiffres)', () => {
    expect(normalizePhone('12345678901234567890')).toBeNull()
  })
})
