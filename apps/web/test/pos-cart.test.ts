import { describe, expect, it } from 'vitest'
import {
  addLine,
  cartTotal,
  removeLine,
  setQty,
  toCreateOrderItems,
  type PosCart,
} from '../src/app/app/commandes/sur-place/cart'

const poulet = { menuItemId: 'm1', name: 'Poulet DG', unitPrice: 4500 }
const sauce = { id: 's1', name: 'Sauce', price: 500 }
const piment = { id: 's2', name: 'Piment', price: 300 }

describe('addLine', () => {
  it('crée une ligne pour un nouveau plat', () => {
    const cart = addLine({ lines: [] }, poulet, [])
    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0]).toMatchObject({
      menuItemId: 'm1', name: 'Poulet DG', unitPrice: 4500, qty: 1, supplements: [],
    })
  })

  it('ré-ajout du même plat + mêmes suppléments fusionne (qty+1, 1 ligne)', () => {
    let cart: PosCart = { lines: [] }
    cart = addLine(cart, poulet, [sauce])
    cart = addLine(cart, poulet, [sauce])
    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0].qty).toBe(2)
  })

  it('mêmes suppléments dans un ordre différent fusionnent aussi (clé triée)', () => {
    let cart: PosCart = { lines: [] }
    cart = addLine(cart, poulet, [sauce, piment])
    cart = addLine(cart, poulet, [piment, sauce])
    expect(cart.lines).toHaveLength(1)
    expect(cart.lines[0].qty).toBe(2)
  })

  it('même plat mais suppléments différents → 2 lignes', () => {
    let cart: PosCart = { lines: [] }
    cart = addLine(cart, poulet, [])
    cart = addLine(cart, poulet, [sauce])
    expect(cart.lines).toHaveLength(2)
    expect(cart.lines.find((l) => l.supplements.length === 0)?.qty).toBe(1)
    expect(cart.lines.find((l) => l.supplements.length === 1)?.qty).toBe(1)
  })
})

describe('setQty', () => {
  it('ajuste la quantité d’une ligne existante', () => {
    let cart = addLine({ lines: [] }, poulet, [])
    const key = cart.lines[0].key
    cart = setQty(cart, key, 5)
    expect(cart.lines[0].qty).toBe(5)
  })

  it('qty<=0 retire la ligne', () => {
    let cart = addLine({ lines: [] }, poulet, [])
    const key = cart.lines[0].key
    cart = setQty(cart, key, 0)
    expect(cart.lines).toEqual([])
  })
})

describe('removeLine', () => {
  it('retire la ligne par clé', () => {
    let cart = addLine({ lines: [] }, poulet, [])
    const key = cart.lines[0].key
    cart = removeLine(cart, key)
    expect(cart.lines).toEqual([])
  })
})

describe('cartTotal', () => {
  it('somme qty*(unitPrice + Σ suppléments)', () => {
    let cart: PosCart = { lines: [] }
    cart = addLine(cart, poulet, [sauce, piment]) // 4500+500+300 = 5300
    cart = setQty(cart, cart.lines[0].key, 2) // 10600
    expect(cartTotal(cart)).toBe(10600)
  })

  it('panier vide → 0', () => {
    expect(cartTotal({ lines: [] })).toBe(0)
  })
})

describe('toCreateOrderItems', () => {
  it('omet supplement_ids si vide', () => {
    const cart = addLine({ lines: [] }, poulet, [])
    expect(toCreateOrderItems(cart)).toEqual([{ menu_item_id: 'm1', qty: 1 }])
  })

  it('inclut supplement_ids quand présents', () => {
    const cart = addLine({ lines: [] }, poulet, [sauce, piment])
    expect(toCreateOrderItems(cart)).toEqual([
      { menu_item_id: 'm1', qty: 1, supplement_ids: [sauce.id, piment.id] },
    ])
  })
})
