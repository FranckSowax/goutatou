import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { transition, type BotContext } from '../src/bot/machine.js'
import { isOrderStatusKeyword } from '../src/bot/order-status.js'

const baseCtx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [{ id: 'slot-1', label: '12h00 – 12h15' }],
  menu: {
    categories: [{ name: 'Plats', items: [{ id: 'item-bobun', name: 'Bo Bun', price: 4500 }] }],
  },
}

describe('isOrderStatusKeyword', () => {
  it('reconnaît les formulations naturelles, avec ou sans accents/ponctuation/casse', () => {
    for (const input of [
      'commande', 'ma commande', 'mes commandes', 'statut', 'suivi',
      'où en est ma commande', 'ou en est ma commande', 'Où en est ma commande ?',
      'statut commande', 'statut de ma commande', 'suivi commande', 'suivi de commande',
      'où est ma commande', 'SUIVI', '  Ma Commande  ',
    ]) {
      expect(isOrderStatusKeyword(input), input).toBe(true)
    }
  })

  it('ne matche PAS les autres mots-clés globaux ni le texte libre', () => {
    for (const input of [
      'menu', 'annuler', 'humain', 'infos', 'panier', 'promos', 'roue',
      'je veux commander', 'commande annulée par erreur', '1', '', 'quartier Nzeng-Ayong commande',
    ]) {
      expect(isOrderStatusKeyword(input), input).toBe(false)
    }
  })
})

describe('commande globale « où en est ma commande »', () => {
  it('commande active en préparation → n°, statut en clair, mode et total', () => {
    const ctx: BotContext = {
      ...baseCtx,
      activeOrder: { orderNumber: 42, status: 'en_preparation', mode: 'drive', total: 9000 },
    }
    const r = transition('ACCUEIL', EMPTY_CART, 'ma commande', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.replies[0]).toContain('n°42')
    expect(r.replies[0]).toContain('👩‍🍳')
    expect(r.replies[0]).toContain('En préparation')
    expect(r.replies[0]).toContain('🚗')
    expect(r.replies[0]).toContain('9 000')
  })

  it('commande prête → ✅ prête', () => {
    const ctx: BotContext = {
      ...baseCtx,
      activeOrder: { orderNumber: 7, status: 'prete', mode: 'livraison', total: 4500 },
    }
    const r = transition('MENU', EMPTY_CART, 'statut', ctx)
    expect(r.replies[0]).toContain('✅')
    expect(r.replies[0]).toContain('Prête')
    expect(r.replies[0]).toContain('🛵')
  })

  it('commande reçue → 📥 reçue', () => {
    const ctx: BotContext = {
      ...baseCtx,
      activeOrder: { orderNumber: 8, status: 'recue', mode: 'sur_place', total: 2000 },
    }
    const r = transition('ACCUEIL', EMPTY_CART, 'où en est ma commande ?', ctx)
    expect(r.replies[0]).toContain('📥')
    expect(r.replies[0]).toContain('Reçue')
  })

  it('aucune commande active (activeOrder null) → message doux vers *menu*', () => {
    const ctx: BotContext = { ...baseCtx, activeOrder: null }
    const r = transition('ACCUEIL', EMPTY_CART, 'suivi', ctx)
    expect(r.replies[0]).toContain("Vous n'avez pas de commande en cours")
    expect(r.replies[0]).toContain('*menu*')
  })

  it('activeOrder non injecté (ctx absent) → même message doux, jamais de crash', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'commande', baseCtx)
    expect(r.replies[0]).toContain("Vous n'avez pas de commande en cours")
  })

  it('en pleine commande (état MODE) → état et panier conservés', () => {
    const cart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 2 }] }
    const ctx: BotContext = {
      ...baseCtx,
      activeOrder: { orderNumber: 42, status: 'recue', mode: 'drive', total: 9000 },
    }
    const r = transition('MODE', cart, 'MA COMMANDE', ctx)
    expect(r.state).toBe('MODE')
    expect(r.cart).toEqual(cart)
  })

  it('état HUMAIN → silence total (le mot-clé ne réveille pas le bot)', () => {
    const ctx: BotContext = {
      ...baseCtx,
      activeOrder: { orderNumber: 42, status: 'recue', mode: 'drive', total: 9000 },
    }
    const r = transition('HUMAIN', EMPTY_CART, 'ma commande', ctx)
    expect(r.state).toBe('HUMAIN')
    expect(r.replies).toEqual([])
  })
})
