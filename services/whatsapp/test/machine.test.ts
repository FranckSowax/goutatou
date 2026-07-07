import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { transition, renderMenu, type BotContext } from '../src/bot/machine.js'

const ctx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [
    { id: 'slot-1', label: '12h00 – 12h15' },
    { id: 'slot-2', label: '12h15 – 12h30' },
  ],
  menu: {
    categories: [
      { name: 'Plats', items: [
        { id: 'item-bobun', name: 'Bo Bun', price: 4500 },
        { id: 'item-nems', name: 'Nems (x4)', price: 2500 },
      ]},
      { name: 'Boissons', items: [{ id: 'item-coca', name: 'Coca 33cl', price: 1000 }] },
    ],
  },
}

describe('renderMenu', () => {
  it('numérote les items en continu à travers les catégories', () => {
    const menu = renderMenu(ctx)
    expect(menu).toContain('*Plats*')
    expect(menu).toContain('1. Bo Bun — 4 500 FCFA')
    expect(menu).toContain('2. Nems (x4) — 2 500 FCFA')
    expect(menu).toContain('3. Coca 33cl — 1 000 FCFA')
  })
})

describe('transition — accueil et menu', () => {
  it('ACCUEIL: message inconnu → bienvenue + invite menu', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'bonjour', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.replies[0]).toContain('Chez Test')
    expect(r.replies[0]).toContain('*menu*')
  })

  it('"menu" depuis n’importe quel état → MENU avec la carte', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'Menu', ctx)
    expect(r.state).toBe('MENU')
    expect(r.replies[0]).toContain('1. Bo Bun')
  })

  it('MENU: "1" ajoute 1 Bo Bun au panier', () => {
    const r = transition('MENU', EMPTY_CART, '1', ctx)
    expect(r.cart.items).toEqual([{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1 }])
    expect(r.replies[0]).toContain('Bo Bun')
    expect(r.replies[0]).toContain('*valider*')
  })

  it('MENU: "3x2" ajoute 2 Coca', () => {
    const r = transition('MENU', EMPTY_CART, '3x2', ctx)
    expect(r.cart.items[0]).toEqual({ menuItemId: 'item-coca', name: 'Coca 33cl', unitPrice: 1000, qty: 2 })
  })

  it('MENU: re-ajouter le même item incrémente la quantité', () => {
    const once = transition('MENU', EMPTY_CART, '1', ctx)
    const twice = transition('MENU', once.cart, '1', ctx)
    expect(twice.cart.items[0].qty).toBe(2)
  })

  it('MENU: numéro hors carte → message d’erreur, panier inchangé', () => {
    const r = transition('MENU', EMPTY_CART, '9', ctx)
    expect(r.cart.items).toHaveLength(0)
    expect(r.replies[0]).toContain('pas compris')
  })

  it('"panier" affiche le récap avec total', () => {
    const cart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 2 }] }
    const r = transition('MENU', cart, 'panier', ctx)
    expect(r.replies[0]).toContain('2× Bo Bun')
    expect(r.replies[0]).toContain('9 000 FCFA')
  })

  it('"annuler" vide le panier et revient à ACCUEIL', () => {
    const cart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] }
    const r = transition('MODE', cart, 'annuler', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart.items).toHaveLength(0)
  })

  it('"humain" → HUMAIN (bot silencieux), "bot" reprend', () => {
    const r = transition('MENU', EMPTY_CART, 'humain', ctx)
    expect(r.state).toBe('HUMAIN')
    const silent = transition('HUMAIN', EMPTY_CART, 'bonjour ?', ctx)
    expect(silent.replies).toHaveLength(0)
    expect(silent.state).toBe('HUMAIN')
    const back = transition('HUMAIN', EMPTY_CART, 'bot', ctx)
    expect(back.state).toBe('ACCUEIL')
  })

  it('"valider" avec panier vide → invite à commander d’abord', () => {
    const r = transition('MENU', EMPTY_CART, 'valider', ctx)
    expect(r.state).toBe('MENU')
    expect(r.replies[0]).toContain('panier est vide')
  })
})
