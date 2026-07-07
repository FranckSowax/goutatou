import { describe, expect, it } from 'vitest'
import { EMPTY_CART, cartTotal, formatFcfa, type CartItem } from '../src/types.js'

describe('formatFcfa', () => {
  it('formate 4500 avec un espace normal comme séparateur de milliers', () => {
    expect(formatFcfa(4500)).toBe('4 500 FCFA')
  })
  it('formate 1000 avec un espace normal comme séparateur de milliers', () => {
    expect(formatFcfa(1000)).toBe('1 000 FCFA')
  })
  it('formate 0 sans séparateur', () => {
    expect(formatFcfa(0)).toBe('0 FCFA')
  })
})

describe('cartTotal', () => {
  it('calcule le total pondéré par la quantité', () => {
    expect(
      cartTotal({ items: [{ menuItemId: 'a', name: 'A', unitPrice: 4500, qty: 2 }] })
    ).toBe(9000)
  })
  it('retourne 0 pour un panier vide', () => {
    expect(cartTotal(EMPTY_CART)).toBe(0)
  })
})

describe('EMPTY_CART', () => {
  it('est gelé', () => {
    expect(Object.isFrozen(EMPTY_CART)).toBe(true)
  })
  it('empêche la mutation de son tableau items', () => {
    expect(() => (EMPTY_CART.items as CartItem[]).push({ menuItemId: 'x', name: 'X', unitPrice: 1, qty: 1 })).toThrow()
  })
})
