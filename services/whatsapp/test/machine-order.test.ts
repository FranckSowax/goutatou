import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { transition, type BotContext } from '../src/bot/machine.js'

const ctx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [
    { id: 'slot-1', label: '12h00 – 12h15' },
    { id: 'slot-2', label: '12h15 – 12h30' },
  ],
  menu: { categories: [{ name: 'Plats', items: [{ id: 'item-bobun', name: 'Bo Bun', price: 4500 }] }] },
}
const cartWithItem: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] }

describe('flow drive complet', () => {
  it('valider → MODE avec 3 options (drive activé)', () => {
    const r = transition('MENU', cartWithItem, 'valider', ctx)
    expect(r.state).toBe('MODE')
    expect(r.replies[0]).toContain('1. 🚗 Drive')
    expect(r.replies[0]).toContain('3. 🥡 À emporter')
  })

  it('MODE "1" (drive) → CRENEAU avec les créneaux', () => {
    const r = transition('MODE', cartWithItem, '1', ctx)
    expect(r.state).toBe('CRENEAU')
    expect(r.cart.mode).toBe('drive')
    expect(r.replies[0]).toContain('1. 12h00 – 12h15')
  })

  it('CRENEAU "2" → CONFIRMATION avec récap et créneau', () => {
    const r = transition('CRENEAU', { ...cartWithItem, mode: 'drive' }, '2', ctx)
    expect(r.state).toBe('CONFIRMATION')
    expect(r.cart.driveSlotId).toBe('slot-2')
    expect(r.replies[0]).toContain('Créneau : 12h15 – 12h30')
    expect(r.replies[0]).toContain('4 500 FCFA')
  })

  it('CONFIRMATION "1" → createOrder=true, retour ACCUEIL, panier conservé pour le processor', () => {
    const cart: Cart = { ...cartWithItem, mode: 'drive', driveSlotId: 'slot-2', driveSlotLabel: '12h15 – 12h30' }
    const r = transition('CONFIRMATION', cart, '1', ctx)
    expect(r.createOrder).toBe(true)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart.items).toHaveLength(1) // le processor lit le panier PUIS le réinitialise
  })

  it('CONFIRMATION "2" → annulation, panier vidé', () => {
    const r = transition('CONFIRMATION', { ...cartWithItem, mode: 'drive' }, '2', ctx)
    expect(r.createOrder).toBeUndefined()
    expect(r.cart.items).toHaveLength(0)
  })
})

describe('flow livraison et sur place', () => {
  it('MODE "2" (livraison) → ADRESSE ; adresse valide → CONFIRMATION', () => {
    const r1 = transition('MODE', cartWithItem, '2', ctx)
    expect(r1.state).toBe('ADRESSE')
    const r2 = transition('ADRESSE', r1.cart, 'Quartier Glass, immeuble bleu', ctx)
    expect(r2.state).toBe('CONFIRMATION')
    expect(r2.cart.address).toBe('Quartier Glass, immeuble bleu')
  })

  it('ADRESSE trop courte → redemande', () => {
    const r = transition('ADRESSE', { ...cartWithItem, mode: 'livraison' }, 'ici', ctx)
    expect(r.state).toBe('ADRESSE')
  })

  it('MODE "3" (sur place) → CONFIRMATION directe', () => {
    const r = transition('MODE', cartWithItem, '3', ctx)
    expect(r.state).toBe('CONFIRMATION')
    expect(r.cart.mode).toBe('sur_place')
  })
})

describe('drive désactivé', () => {
  const noDriveCtx: BotContext = { ...ctx, driveEnabled: false }
  it('MODE ne propose que 2 options, "1" = livraison', () => {
    const r0 = transition('MENU', cartWithItem, 'valider', noDriveCtx)
    expect(r0.replies[0]).not.toContain('Drive')
    const r = transition('MODE', cartWithItem, '1', noDriveCtx)
    expect(r.cart.mode).toBe('livraison')
  })
})
