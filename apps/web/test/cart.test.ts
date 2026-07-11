import { describe, expect, it } from 'vitest'
import { cartReducer, lineKey, normalizeCartItems, webCartTotal, type WebCartItem } from '../src/lib/lp/cart'

const bobun = { menuItemId: 'a', name: 'Bo Bun', unitPrice: 4500, supplements: [] }
const nems = { id: 's1', name: 'Nems', price: 500 }
const bobunNems = { ...bobun, supplements: [nems] }

describe('cartReducer', () => {
  it('add ajoute puis incrémente', () => {
    let s: WebCartItem[] = []
    s = cartReducer(s, { type: 'add', item: bobun })
    s = cartReducer(s, { type: 'add', item: bobun })
    expect(s).toEqual([{ ...bobun, qty: 2 }])
  })
  it('setQty ajuste et supprime à 0 ; plafonne à 20', () => {
    let s = cartReducer([], { type: 'add', item: bobun })
    const key = lineKey(bobun)
    s = cartReducer(s, { type: 'setQty', lineKey: key, qty: 5 })
    expect(s[0].qty).toBe(5)
    s = cartReducer(s, { type: 'setQty', lineKey: key, qty: 99 })
    expect(s[0].qty).toBe(20)
    s = cartReducer(s, { type: 'setQty', lineKey: key, qty: 0 })
    expect(s).toEqual([])
  })
  it('remove et clear', () => {
    let s = cartReducer([], { type: 'add', item: bobun })
    expect(cartReducer(s, { type: 'remove', lineKey: lineKey(bobun) })).toEqual([])
    expect(cartReducer(s, { type: 'clear' })).toEqual([])
  })
  it('total', () => {
    const s = cartReducer(
      cartReducer([], { type: 'add', item: bobun }),
      { type: 'setQty', lineKey: lineKey(bobun), qty: 2 },
    )
    expect(webCartTotal(s)).toBe(9000)
  })

  it('deux ajouts du même plat avec des suppléments différents forment des lignes séparées', () => {
    let s: WebCartItem[] = []
    s = cartReducer(s, { type: 'add', item: bobun })
    s = cartReducer(s, { type: 'add', item: bobunNems })
    expect(s).toHaveLength(2)
    expect(s.find((i) => i.supplements.length === 0)?.qty).toBe(1)
    expect(s.find((i) => i.supplements.length === 1)?.qty).toBe(1)
  })

  it('même plat + mêmes suppléments (ordre différent) = même ligne', () => {
    const chevre = { id: 's2', name: 'Chèvre', price: 300 }
    let s: WebCartItem[] = []
    s = cartReducer(s, { type: 'add', item: { ...bobun, supplements: [nems, chevre] } })
    s = cartReducer(s, { type: 'add', item: { ...bobun, supplements: [chevre, nems] } })
    expect(s).toHaveLength(1)
    expect(s[0].qty).toBe(2)
  })

  it('le total inclut le prix des suppléments', () => {
    const s = cartReducer([], { type: 'add', item: bobunNems })
    expect(webCartTotal(s)).toBe(5000)
  })
})

describe('normalizeCartItems', () => {
  it('ajoute supplements: [] par défaut sur un ancien panier sans ce champ', () => {
    const legacy = [{ menuItemId: 'a', name: 'Bo Bun', unitPrice: 4500, qty: 2 }]
    expect(normalizeCartItems(legacy)).toEqual([{ ...legacy[0], supplements: [] }])
  })
  it('ne plante jamais sur des entrées malformées', () => {
    expect(normalizeCartItems(null)).toEqual([])
    expect(normalizeCartItems(undefined)).toEqual([])
    expect(normalizeCartItems('oops')).toEqual([])
    expect(normalizeCartItems([{ menuItemId: 'a' }, 42, null])).toEqual([])
  })
  it('filtre les suppléments malformés dans une entrée par ailleurs valide', () => {
    const raw = [{ menuItemId: 'a', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [nems, { bad: true }, 1] }]
    expect(normalizeCartItems(raw)).toEqual([{ menuItemId: 'a', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [nems] }])
  })
})
