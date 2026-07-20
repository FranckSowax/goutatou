import { describe, expect, it } from 'vitest'
import type { BotState, Cart } from '@goutatou/db'
import { transition, type BotContext } from '../src/bot/machine.js'

const baseCtx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: false,
  driveSlots: [],
  menu: { categories: [{ name: 'Plats', items: [{ id: 'item-bobun', name: 'Bo Bun', price: 4500 }] }] },
}

const airtelCtx: BotContext = {
  ...baseCtx,
  payment: { cashEnabled: true, airtelEnabled: true, airtelNumber: '074000001', airtelName: 'Awa N.' },
}

const cart: Cart = {
  items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1 }],
  mode: 'sur_place',
}

describe('transition — état inconnu (audit lot B correctif 4b)', () => {
  it('repart sur ACCUEIL avec le message d\'accueil au lieu de renvoyer undefined', () => {
    const r = transition('ETAT_INEXISTANT' as BotState, cart, 'bonjour', baseCtx)
    expect(r).toBeDefined()
    expect(r.state).toBe('ACCUEIL')
    expect(r.replies[0]).toContain('Chez Test')
    expect(r.createOrder).toBeUndefined()
  })

  it('conserve le panier (aucune perte de commande en cours)', () => {
    const r = transition('LEGACY' as BotState, cart, 'salut', baseCtx)
    expect(r.cart).toEqual(cart)
  })
})

describe('PAIEMENT_REF — garde config Airtel (audit lot B correctif 4c)', () => {
  it('config Airtel disparue en cours de conversation → bascule sur le flux sans paiement Airtel', () => {
    const ctx: BotContext = {
      ...baseCtx,
      payment: { cashEnabled: true, airtelEnabled: false, airtelNumber: null, airtelName: null },
    }
    const r = transition('PAIEMENT_REF', cart, 'TX-9042-AB', ctx)
    expect(r.createOrder).toBe(true)
    expect(r.state).toBe('ACCUEIL')
    // Aucune commande airtel/a_verifier créée → pas de ticket cuisine retenu indéfiniment.
    expect(r.cart.payment).toBeUndefined()
    expect(r.cart.paymentRef).toBeUndefined()
  })

  it('ctx.payment absent (resto sans paiement) → même bascule', () => {
    const r = transition('PAIEMENT_REF', cart, 'TX-9042-AB', baseCtx)
    expect(r.createOrder).toBe(true)
    expect(r.cart.payment).toBeUndefined()
  })

  it('numéro Airtel effacé (activé mais vide) → bascule aussi', () => {
    const ctx: BotContext = {
      ...baseCtx,
      payment: { cashEnabled: true, airtelEnabled: true, airtelNumber: null, airtelName: null },
    }
    const r = transition('PAIEMENT_REF', cart, 'TX-9042-AB', ctx)
    expect(r.createOrder).toBe(true)
  })
})

describe('PAIEMENT_REF — validation de la référence (audit lot B correctif 4c)', () => {
  it('« non » n\'est plus accepté comme référence : re-prompt, aucune commande', () => {
    const r = transition('PAIEMENT_REF', cart, 'non', airtelCtx)
    expect(r.state).toBe('PAIEMENT_REF')
    expect(r.createOrder).toBeUndefined()
    expect(r.replies).toHaveLength(1)
  })

  it('autres refus courants refusés aussi (Non, rien, aucune, pas encore)', () => {
    for (const input of ['Non', 'NON', 'rien', 'aucune', 'pas encore']) {
      const r = transition('PAIEMENT_REF', cart, input, airtelCtx)
      expect(r.state, input).toBe('PAIEMENT_REF')
      expect(r.createOrder, input).toBeUndefined()
    }
  })

  it('« payé » / « paye » restent valides (client qui a payé sans noter la référence)', () => {
    for (const input of ['payé', 'paye', 'PAYÉ']) {
      const r = transition('PAIEMENT_REF', cart, input, airtelCtx)
      expect(r.createOrder, input).toBe(true)
      expect(r.cart.payment, input).toBe('airtel')
    }
  })

  it('une vraie référence passe toujours', () => {
    const r = transition('PAIEMENT_REF', cart, ' TX-9042-AB ', airtelCtx)
    expect(r.createOrder).toBe(true)
    expect(r.cart.payment).toBe('airtel')
    expect(r.cart.paymentRef).toBe('TX-9042-AB')
  })
})
