import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { matchButtonInput } from '../src/bot/buttons.js'
import type { BotContext } from '../src/bot/machine.js'

const menuWithSupplements = {
  categories: [{ name: 'Plats', items: [
    { id: 'i1', name: 'Poulet DG', price: 5500, supplements: [
      { id: 's1', name: 'Frites maison', price: 1000 },
      { id: 's2', name: 'Sauce piment', price: 300 },
    ] },
  ] }],
}

const ctx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [{ id: 'sl1', label: '12h00' }],
  menu: menuWithSupplements,
}

const cartWithItem: Cart = { items: [{ menuItemId: 'i1', name: 'Poulet DG', unitPrice: 5500, qty: 1 }] }

describe('matchButtonInput — retraduction titre → entrée machine', () => {
  it('« Non merci » en SUPPLEMENTS_CHECKOUT → « 0 » (id in:0)', () => {
    expect(matchButtonInput('SUPPLEMENTS_CHECKOUT', cartWithItem, ctx, 'Non merci')).toBe('0')
    expect(matchButtonInput('SUPPLEMENTS', cartWithItem, ctx, 'Non merci')).toBe('0')
  })

  it('titre d’un supplément → son rang (id in:1)', () => {
    expect(matchButtonInput('SUPPLEMENTS_CHECKOUT', cartWithItem, ctx, 'Frites maison +1000 F')).toBe('1')
    expect(matchButtonInput('SUPPLEMENTS_CHECKOUT', cartWithItem, ctx, 'Sauce piment +300 F')).toBe('2')
  })

  it('titre tronqué (troncature à l’envoi) → match par préfixe unique', () => {
    // Le bouton envoyé pour « Frites maison +1000 F » est tronqué à 20 car. → « Frites maison +100… ».
    expect(matchButtonInput('SUPPLEMENTS_CHECKOUT', cartWithItem, ctx, 'Frites maison +100…')).toBe('1')
  })

  it('insensible à la casse et aux espaces', () => {
    expect(matchButtonInput('SUPPLEMENTS_CHECKOUT', cartWithItem, ctx, '  non merci ')).toBe('0')
  })

  it('CONFIRMATION : « Oui » → « oui », « Annuler » → « annuler »', () => {
    expect(matchButtonInput('CONFIRMATION', cartWithItem, ctx, 'Oui')).toBe('oui')
    expect(matchButtonInput('CONFIRMATION', cartWithItem, ctx, 'Annuler')).toBe('annuler')
  })

  it('entrée déjà canonique (« 0 », « 2 ») → null (aucun titre ne correspond, body inchangé)', () => {
    expect(matchButtonInput('SUPPLEMENTS_CHECKOUT', cartWithItem, ctx, '0')).toBeNull()
    expect(matchButtonInput('CONFIRMATION', cartWithItem, ctx, '2')).toBeNull()
  })

  it('état sans choix fermés (MENU/ACCUEIL) → null', () => {
    expect(matchButtonInput('MENU', cartWithItem, ctx, 'Non merci')).toBeNull()
    expect(matchButtonInput('ACCUEIL', EMPTY_CART, ctx, 'Oui')).toBeNull()
  })

  it('titre inconnu de l’état → null', () => {
    expect(matchButtonInput('SUPPLEMENTS_CHECKOUT', cartWithItem, ctx, 'Coca')).toBeNull()
  })
})
