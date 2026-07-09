import { describe, expect, it } from 'vitest'
import { buildWaLink, normalizeGabonPhone } from '../src/lib/lp/wa'

describe('normalizeGabonPhone', () => {
  it('accepte les formats courants gabonais', () => {
    expect(normalizeGabonPhone('077123456')).toBe('24177123456')
    expect(normalizeGabonPhone('+241 77 12 34 56')).toBe('24177123456')
    expect(normalizeGabonPhone('241 77 12 34 56')).toBe('24177123456')
    expect(normalizeGabonPhone('77 12 34 56')).toBe('24177123456')
  })
  it('rejette les numéros inexploitables', () => {
    expect(normalizeGabonPhone('')).toBeNull()
    expect(normalizeGabonPhone('123')).toBeNull()
    expect(normalizeGabonPhone('abc')).toBeNull()
  })
})

describe('buildWaLink', () => {
  it('construit le lien avec texte pré-rempli encodé', () => {
    expect(buildWaLink('24177123456', 'Bonjour, je veux commander !'))
      .toBe('https://wa.me/24177123456?text=Bonjour%2C%20je%20veux%20commander%20!')
  })
  it('sans texte → lien nu, et nettoie les non-chiffres', () => {
    expect(buildWaLink('+241 77-12-34-56')).toBe('https://wa.me/24177123456')
  })
})
