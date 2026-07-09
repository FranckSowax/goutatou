import { describe, expect, it } from 'vitest'
import { shouldOfferSpin } from '../src/types.js'

describe('shouldOfferSpin', () => {
  it('offre un tour au multiple de N', () => {
    expect(shouldOfferSpin(5, 5)).toBe(true)
    expect(shouldOfferSpin(10, 5)).toBe(true)
    expect(shouldOfferSpin(4, 5)).toBe(false)
    expect(shouldOfferSpin(6, 5)).toBe(false)
  })
  it('jamais à 0 commande, et N>=1 requis', () => {
    expect(shouldOfferSpin(0, 5)).toBe(false)
    expect(shouldOfferSpin(3, 0)).toBe(false)
  })
})
