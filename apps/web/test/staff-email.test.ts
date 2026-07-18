import { describe, it, expect } from 'vitest'
import { staffEmailFromPhone } from '../src/lib/staff-email'

describe('staffEmailFromPhone', () => {
  it('dérive un email technique déterministe depuis un numéro gabonais', () => {
    expect(staffEmailFromPhone('077123456')).toBe('wa-24177123456@staff.goutatou.app')
    expect(staffEmailFromPhone('24177123456')).toBe('wa-24177123456@staff.goutatou.app')
    expect(staffEmailFromPhone('77123456')).toBe('wa-24177123456@staff.goutatou.app')
  })
  it('ignore espaces et séparateurs (même compte)', () => {
    expect(staffEmailFromPhone('+241 77 12 34 56')).toBe('wa-24177123456@staff.goutatou.app')
    expect(staffEmailFromPhone('077-12-34-56')).toBe(staffEmailFromPhone('077123456'))
  })
  it('renvoie null pour un numéro invalide', () => {
    expect(staffEmailFromPhone('')).toBeNull()
    expect(staffEmailFromPhone('123')).toBeNull()
    expect(staffEmailFromPhone('abc')).toBeNull()
  })
})
