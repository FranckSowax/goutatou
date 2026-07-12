import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { beginCheckout, transition, type BotContext } from '../src/bot/machine.js'
import { copy } from '../src/bot/copy.js'

const ctx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [{ id: 'slot-1', label: '12h00 – 12h15' }],
  menu: {
    categories: [{ name: 'Plats', items: [
      { id: 'item-bobun', name: 'Bo Bun', price: 4500 },
      { id: 'item-nems', name: 'Nems (x4)', price: 2500 },
    ] }],
  },
}

const twoDishesCart: Cart = {
  items: [
    { menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [] },
    { menuItemId: 'item-nems', name: 'Nems (x4)', unitPrice: 2500, qty: 2, supplements: [] },
  ],
}

describe('beginCheckout — addition pure (panier importé, ex. panier WhatsApp natif)', () => {
  it('panier non vide → état MODE, récap panier + question mode identiques aux helpers copy', () => {
    const r = beginCheckout(twoDishesCart, ctx)
    expect(r.state).toBe('MODE')
    expect(r.cart).toBe(twoDishesCart)
    expect(r.replies).toEqual([
      copy.cartRecap(twoDishesCart),
      copy.chooseMode(['🚗 Drive (retrait sur créneau)', '🛵 Livraison', '🍽️ Sur place']),
    ])
  })

  it('récap byte-identique à celui produit par "panier"/CONFIRMATION (même helper copy.cartRecap)', () => {
    const r = beginCheckout(twoDishesCart, ctx)
    const viaCommandePanier = transition('MENU', twoDishesCart, 'panier', ctx)
    expect(r.replies[0]).toBe(viaCommandePanier.replies[0])
  })

  it('question mode byte-identique à celle du flux "valider" (mêmes modes selon ctx)', () => {
    const oneDishCart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [] }] }
    const r = beginCheckout(oneDishCart, ctx)
    const viaValider = transition('MENU', oneDishCart, 'valider', ctx)
    expect(r.replies[1]).toBe(viaValider.replies[0])
  })

  it('drive désactivé → modes proposés sans Drive (comme le flux valider)', () => {
    const noDriveCtx: BotContext = { ...ctx, driveEnabled: false }
    const r = beginCheckout(twoDishesCart, noDriveCtx)
    expect(r.replies[1]).not.toContain('Drive')
    expect(r.replies[1]).toContain('1. 🛵 Livraison')
  })

  it('panier vide → état MENU + message emptyCart (défensif), pas de crash', () => {
    const r = beginCheckout(EMPTY_CART, ctx)
    expect(r.state).toBe('MENU')
    expect(r.replies).toEqual([copy.emptyCart])
    expect(r.cart).toBe(EMPTY_CART)
  })

  it("n'altère aucun état/branche existant : transition('MENU', ..., 'valider', ctx) reste inchangée (sans récap)", () => {
    const oneDishCart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [] }] }
    const r = transition('MENU', oneDishCart, 'valider', ctx)
    expect(r.replies).toHaveLength(1) // pas de récap ajouté au flux "valider" existant
  })
})
