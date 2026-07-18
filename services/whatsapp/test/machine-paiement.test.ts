import { describe, expect, it } from 'vitest'
import type { Cart } from '@goutatou/db'
import { transition, type BotContext } from '../src/bot/machine.js'
import { buttonsForState } from '../src/bot/buttons.js'

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

describe('CONFIRMATION → PAIEMENT (gating par ctx.payment)', () => {
  it('oui + Airtel activé (numéro renseigné) → état PAIEMENT avec la question et le montant, pas de commande', () => {
    const r = transition('CONFIRMATION', cart, 'oui', airtelCtx)
    expect(r.state).toBe('PAIEMENT')
    expect(r.createOrder).toBeUndefined()
    expect(r.replies[0]).toContain('💳')
    expect(r.replies[0]).toContain('4 500 FCFA')
  })

  it('oui SANS ctx.payment (resto par défaut) → createOrder direct, comportement actuel inchangé', () => {
    const r = transition('CONFIRMATION', cart, 'oui', baseCtx)
    expect(r.createOrder).toBe(true)
    expect(r.state).toBe('ACCUEIL')
    expect(r.replies).toEqual([])
    expect(r.cart.payment).toBeUndefined()
  })

  it('oui + Airtel désactivé → createOrder direct (flux actuel)', () => {
    const ctx: BotContext = {
      ...baseCtx,
      payment: { cashEnabled: true, airtelEnabled: false, airtelNumber: null, airtelName: null },
    }
    const r = transition('CONFIRMATION', cart, 'oui', ctx)
    expect(r.createOrder).toBe(true)
    expect(r.state).toBe('ACCUEIL')
  })

  it('oui + Airtel activé mais numéro absent → createOrder direct (étape sautée)', () => {
    const ctx: BotContext = {
      ...baseCtx,
      payment: { cashEnabled: true, airtelEnabled: true, airtelNumber: null, airtelName: null },
    }
    const r = transition('CONFIRMATION', cart, 'oui', ctx)
    expect(r.createOrder).toBe(true)
    expect(r.state).toBe('ACCUEIL')
  })
})

describe('état PAIEMENT', () => {
  it('cash → cart.payment=cash, createOrder direct', () => {
    const r = transition('PAIEMENT', cart, 'cash', airtelCtx)
    expect(r.createOrder).toBe(true)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart.payment).toBe('cash')
    expect(r.cart.paymentRef).toBeUndefined()
  })

  it('airtel → PAIEMENT_REF avec instructions (montant + numéro + nom du titulaire)', () => {
    const r = transition('PAIEMENT', cart, 'airtel', airtelCtx)
    expect(r.state).toBe('PAIEMENT_REF')
    expect(r.createOrder).toBeUndefined()
    expect(r.replies[0]).toContain('4 500 FCFA')
    expect(r.replies[0]).toContain('074000001')
    expect(r.replies[0]).toContain('Awa N.')
  })

  it('airtel sans nom de titulaire → instructions avec le nom du resto en repli', () => {
    const ctx: BotContext = {
      ...baseCtx,
      payment: { cashEnabled: true, airtelEnabled: true, airtelNumber: '074000001', airtelName: null },
    }
    const r = transition('PAIEMENT', cart, 'airtel', ctx)
    expect(r.state).toBe('PAIEMENT_REF')
    expect(r.replies[0]).toContain('Chez Test')
  })

  it('entrée invalide → re-prompt, reste en PAIEMENT', () => {
    const r = transition('PAIEMENT', cart, 'blabla', airtelCtx)
    expect(r.state).toBe('PAIEMENT')
    expect(r.createOrder).toBeUndefined()
    expect(r.replies[0]).toContain('💳')
  })

  it('cash désactivé : "cash" refusé (re-prompt), airtel imposé', () => {
    const ctx: BotContext = {
      ...baseCtx,
      payment: { cashEnabled: false, airtelEnabled: true, airtelNumber: '074000001', airtelName: null },
    }
    const r = transition('PAIEMENT', cart, 'cash', ctx)
    expect(r.state).toBe('PAIEMENT')
    expect(r.createOrder).toBeUndefined()
  })

  it('annuler (mot-clé global) → ACCUEIL, panier vidé', () => {
    const r = transition('PAIEMENT', cart, 'annuler', airtelCtx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart.items).toHaveLength(0)
    expect(r.createOrder).toBeUndefined()
  })
})

describe('état PAIEMENT_REF', () => {
  it('référence valide → createOrder avec cart.payment=airtel et cart.paymentRef', () => {
    const r = transition('PAIEMENT_REF', cart, ' TX-9042-AB ', airtelCtx)
    expect(r.createOrder).toBe(true)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart.payment).toBe('airtel')
    expect(r.cart.paymentRef).toBe('TX-9042-AB')
  })

  it('« payé » → createOrder avec cart.payment=airtel', () => {
    const r = transition('PAIEMENT_REF', cart, 'payé', airtelCtx)
    expect(r.createOrder).toBe(true)
    expect(r.cart.payment).toBe('airtel')
    expect(r.cart.paymentRef).toBe('payé')
  })

  it('texte trop court → re-prompt doux, reste en PAIEMENT_REF', () => {
    const r = transition('PAIEMENT_REF', cart, 'ok', airtelCtx)
    expect(r.state).toBe('PAIEMENT_REF')
    expect(r.createOrder).toBeUndefined()
    expect(r.replies).toHaveLength(1)
  })

  it('annuler (mot-clé global) → ACCUEIL, panier vidé', () => {
    const r = transition('PAIEMENT_REF', cart, 'annuler', airtelCtx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart.items).toHaveLength(0)
  })
})

describe('buttonsForState — PAIEMENT', () => {
  it('cash activé + mode sur_place → [Airtel Money, À la récupération], titres ≤ 20 chars', () => {
    const choices = buttonsForState('PAIEMENT', cart, airtelCtx)!
    expect(choices).toEqual([
      { id: 'in:airtel', title: '📱 Airtel Money' },
      { id: 'in:cash', title: '💵 À la récupération' },
    ])
    for (const c of choices) expect(c.title.length).toBeLessThanOrEqual(20)
  })

  it('mode livraison → le bouton cash devient « À la livraison »', () => {
    const choices = buttonsForState('PAIEMENT', { ...cart, mode: 'livraison' }, airtelCtx)!
    expect(choices[1]).toEqual({ id: 'in:cash', title: '💵 À la livraison' })
  })

  it('cash désactivé → seul le bouton Airtel est proposé', () => {
    const ctx: BotContext = {
      ...baseCtx,
      payment: { cashEnabled: false, airtelEnabled: true, airtelNumber: '074000001', airtelName: null },
    }
    const choices = buttonsForState('PAIEMENT', cart, ctx)!
    expect(choices).toEqual([{ id: 'in:airtel', title: '📱 Airtel Money' }])
  })

  it('sans config paiement dans le contexte → null (pas de boutons)', () => {
    expect(buttonsForState('PAIEMENT', cart, baseCtx)).toBeNull()
  })

  it('PAIEMENT_REF → null (saisie libre)', () => {
    expect(buttonsForState('PAIEMENT_REF', cart, airtelCtx)).toBeNull()
  })
})
