import { describe, expect, it } from 'vitest'
import { cartReducer, webCartTotal, type WebCartItem } from '../src/lib/lp/cart'

const bobun = { menuItemId: 'a', name: 'Bo Bun', unitPrice: 4500 }

describe('cartReducer', () => {
  it('add ajoute puis incrémente', () => {
    let s: WebCartItem[] = []
    s = cartReducer(s, { type: 'add', item: bobun })
    s = cartReducer(s, { type: 'add', item: bobun })
    expect(s).toEqual([{ ...bobun, qty: 2 }])
  })
  it('setQty ajuste et supprime à 0 ; plafonne à 20', () => {
    let s = cartReducer([], { type: 'add', item: bobun })
    s = cartReducer(s, { type: 'setQty', menuItemId: 'a', qty: 5 })
    expect(s[0].qty).toBe(5)
    s = cartReducer(s, { type: 'setQty', menuItemId: 'a', qty: 99 })
    expect(s[0].qty).toBe(20)
    s = cartReducer(s, { type: 'setQty', menuItemId: 'a', qty: 0 })
    expect(s).toEqual([])
  })
  it('remove et clear', () => {
    let s = cartReducer([], { type: 'add', item: bobun })
    expect(cartReducer(s, { type: 'remove', menuItemId: 'a' })).toEqual([])
    expect(cartReducer(s, { type: 'clear' })).toEqual([])
  })
  it('total', () => {
    const s = cartReducer(cartReducer([], { type: 'add', item: bobun }), { type: 'setQty', menuItemId: 'a', qty: 2 })
    expect(webCartTotal(s)).toBe(9000)
  })
})
