import { describe, expect, it } from 'vitest'
import { validPhoneForCountry } from '../src/bot/validation.js'

describe('validPhoneForCountry', () => {
  it('241 (Gabon) : 8 chiffres après indicatif → valide', () => {
    expect(validPhoneForCountry('24177000001')).toBe(true) // 241 + 77000001 (8 chiffres)
  })

  it('241 (Gabon) : 9 chiffres après indicatif (nouveau format) → valide', () => {
    expect(validPhoneForCountry('241077000001')).toBe(true) // 241 + 077000001 (9 chiffres)
  })

  it('241 (Gabon) : 7 chiffres après indicatif → invalide', () => {
    expect(validPhoneForCountry('2417700001')).toBe(false) // 241 + 7700001 (7 chiffres)
  })

  it('241 (Gabon) : 10 chiffres après indicatif → invalide', () => {
    expect(validPhoneForCountry('2410770000012')).toBe(false) // 241 + 0770000012 (10 chiffres)
  })

  it('accepte le format avec séparateurs (+, espaces, tirets)', () => {
    expect(validPhoneForCountry('+241 77-00-00-01')).toBe(true)
  })

  it('autre indicatif : longueur totale 8-15 chiffres → permissif', () => {
    expect(validPhoneForCountry('33612345678')).toBe(true) // France, 11 chiffres
    expect(validPhoneForCountry('12345678')).toBe(true) // 8 chiffres pile
    expect(validPhoneForCountry('123456789012345')).toBe(true) // 15 chiffres pile
  })

  it('autre indicatif : hors plage 8-15 chiffres → invalide', () => {
    expect(validPhoneForCountry('1234567')).toBe(false) // 7 chiffres
    expect(validPhoneForCountry('1234567890123456')).toBe(false) // 16 chiffres
  })
})
