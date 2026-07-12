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
      {
        id: 'item-bobun', name: 'Bo Bun', price: 4500,
        supplements: [
          { id: 'sup-oeuf', name: 'Œuf', price: 300 },
          { id: 'sup-boeuf', name: 'Bœuf', price: 1000 },
        ],
      },
      { id: 'item-nems', name: 'Nems (x4)', price: 2500 },
      {
        id: 'item-dg', name: 'Poulet DG', price: 6000,
        supplements: [{ id: 'sup-piment', name: 'Piment', price: 200 }],
      },
    ] }],
  },
}

const noSupplementsCtx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [{ id: 'slot-1', label: '12h00 – 12h15' }],
  menu: {
    categories: [{ name: 'Plats', items: [
      { id: 'item-nems', name: 'Nems (x4)', price: 2500 },
    ] }],
  },
}

const bobunItem = { menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [] }
const nemsItem = { menuItemId: 'item-nems', name: 'Nems (x4)', unitPrice: 2500, qty: 2, supplements: [] }
const dgItem = { menuItemId: 'item-dg', name: 'Poulet DG', unitPrice: 6000, qty: 1, supplements: [] }

describe('beginCheckout — sans suppléments, comportement inchangé', () => {
  it('panier sans item à suppléments → MODE + récap + chooseMode (existant, rejoué)', () => {
    const cart: Cart = { items: [{ ...nemsItem }] }
    const r = beginCheckout(cart, noSupplementsCtx)
    expect(r.state).toBe('MODE')
    expect(r.replies).toEqual([
      copy.cartRecap(cart),
      copy.chooseMode(['🚗 Drive (retrait sur créneau)', '🛵 Livraison', '🍽️ Sur place']),
    ])
  })
})

describe('beginCheckout — avec suppléments disponibles', () => {
  it('un seul item, avec suppléments → SUPPLEMENTS_CHECKOUT, récap panier importé + prompt suppléments', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const r = beginCheckout(cart, ctx)
    expect(r.state).toBe('SUPPLEMENTS_CHECKOUT')
    expect(r.replies).toEqual([
      copy.cartRecap(cart),
      copy.supplementsPrompt('Bo Bun', ctx.menu.categories[0].items[0].supplements!),
    ])
    // Un seul item : déjà en dernière position, panier retourné inchangé dans son contenu.
    expect(r.cart.items).toEqual([bobunItem])
  })

  it('plusieurs items, un seul avec suppléments et pas en dernier → il est déplacé en dernier', () => {
    const cart: Cart = { items: [{ ...bobunItem }, { ...nemsItem }] }
    const r = beginCheckout(cart, ctx)
    expect(r.state).toBe('SUPPLEMENTS_CHECKOUT')
    // Récap = panier tel qu'importé (ordre inchangé), PAS l'ordre interne réordonné.
    expect(r.replies[0]).toBe(copy.cartRecap(cart))
    expect(r.replies[1]).toBe(copy.supplementsPrompt('Bo Bun', ctx.menu.categories[0].items[0].supplements!))
    // Panier interne : Bo Bun ciblé en dernier.
    expect(r.cart.items.map((it) => it.menuItemId)).toEqual(['item-nems', 'item-bobun'])
  })

  it('item déjà en dernière position → aucun mouvement nécessaire', () => {
    const cart: Cart = { items: [{ ...nemsItem }, { ...bobunItem }] }
    const r = beginCheckout(cart, ctx)
    expect(r.state).toBe('SUPPLEMENTS_CHECKOUT')
    expect(r.cart.items.map((it) => it.menuItemId)).toEqual(['item-nems', 'item-bobun'])
  })
})

describe('SUPPLEMENTS_CHECKOUT — sélection identique à SUPPLEMENTS', () => {
  it('sélection valide → ajoutée au dernier item, dédupliquée, re-prompt "Autre supplément"', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const started = beginCheckout(cart, ctx)
    const r = transition('SUPPLEMENTS_CHECKOUT', started.cart, '1', ctx)
    expect(r.state).toBe('SUPPLEMENTS_CHECKOUT')
    expect(r.cart.items[0].supplements).toEqual([{ id: 'sup-oeuf', name: 'Œuf', price: 300 }])
    expect(r.replies).toEqual([copy.supplementsAgain(ctx.menu.categories[0].items[0].supplements!)])

    // Doublon → ignoré silencieusement.
    const dup = transition('SUPPLEMENTS_CHECKOUT', r.cart, '1', ctx)
    expect(dup.cart.items[0].supplements).toEqual([{ id: 'sup-oeuf', name: 'Œuf', price: 300 }])
  })

  it('entrée invalide → re-prompt avec la même liste (prompt initial ou "Autre supplément" selon l’étape)', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const started = beginCheckout(cart, ctx)
    const invalidFirst = transition('SUPPLEMENTS_CHECKOUT', started.cart, '9', ctx)
    expect(invalidFirst.state).toBe('SUPPLEMENTS_CHECKOUT')
    expect(invalidFirst.replies[0]).toBe(
      copy.supplementsPrompt('Bo Bun', ctx.menu.categories[0].items[0].supplements!),
    )

    const afterPick = transition('SUPPLEMENTS_CHECKOUT', started.cart, '1', ctx)
    const invalidAfter = transition('SUPPLEMENTS_CHECKOUT', afterPick.cart, 'blabla', ctx)
    expect(invalidAfter.replies[0]).toBe(copy.supplementsAgain(ctx.menu.categories[0].items[0].supplements!))
  })
})

describe('SUPPLEMENTS_CHECKOUT — sortie, item unique', () => {
  it.each(['0', 'non', 'NON'])('"%s" avec un seul item → MODE, sorties byte-identiques à beginCheckout sans suppléments', (input) => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const started = beginCheckout(cart, ctx)
    const r = transition('SUPPLEMENTS_CHECKOUT', started.cart, input, ctx)
    expect(r.state).toBe('MODE')

    // Comparaison directe avec un beginCheckout "plain" (aucun supplément choisi) sur un panier
    // équivalent sans suppléments disponibles : mêmes helpers, mêmes sorties.
    const equivalentCart: Cart = { items: [{ ...bobunItem }] }
    const plain = beginCheckout(equivalentCart, noSupplementsCtx)
    expect(r.replies).toEqual(plain.replies)
    expect(r.replies).toEqual([
      copy.cartRecap(equivalentCart),
      copy.chooseMode(['🚗 Drive (retrait sur créneau)', '🛵 Livraison', '🍽️ Sur place']),
    ])
  })

  it('marque suppAsked=true sur l’item sorti', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const started = beginCheckout(cart, ctx)
    const r = transition('SUPPLEMENTS_CHECKOUT', started.cart, '0', ctx)
    expect(r.cart.items[0].suppAsked).toBe(true)
  })
})

describe('SUPPLEMENTS_CHECKOUT — sortie, plusieurs items avec suppléments', () => {
  it('enchaîne sur le prochain item avec suppléments non demandé, puis termine en MODE', () => {
    const cart: Cart = { items: [{ ...bobunItem }, { ...nemsItem }, { ...dgItem }] }
    const started = beginCheckout(cart, ctx)
    expect(started.state).toBe('SUPPLEMENTS_CHECKOUT')
    // Bo Bun ciblé en premier (premier item avec suppléments non demandés).
    expect(started.cart.items.map((it) => it.menuItemId)).toEqual(['item-nems', 'item-dg', 'item-bobun'])
    expect(started.replies[1]).toBe(copy.supplementsPrompt('Bo Bun', ctx.menu.categories[0].items[0].supplements!))

    // Sortie sur Bo Bun → enchaîne sur Poulet DG (seul reste avec suppléments non demandés).
    const afterBobun = transition('SUPPLEMENTS_CHECKOUT', started.cart, '0', ctx)
    expect(afterBobun.state).toBe('SUPPLEMENTS_CHECKOUT')
    expect(afterBobun.replies).toEqual([
      copy.supplementsPrompt('Poulet DG', ctx.menu.categories[0].items[2].supplements!),
    ])
    expect(afterBobun.cart.items.map((it) => it.menuItemId)).toEqual(['item-nems', 'item-bobun', 'item-dg'])
    expect(afterBobun.cart.items.find((it) => it.menuItemId === 'item-bobun')?.suppAsked).toBe(true)

    // Sortie sur Poulet DG → plus rien à demander → MODE + récap + chooseMode.
    const afterDg = transition('SUPPLEMENTS_CHECKOUT', afterBobun.cart, 'non', ctx)
    expect(afterDg.state).toBe('MODE')
    expect(afterDg.replies).toEqual([
      copy.cartRecap(afterDg.cart),
      copy.chooseMode(['🚗 Drive (retrait sur créneau)', '🛵 Livraison', '🍽️ Sur place']),
    ])
    expect(afterDg.cart.items.find((it) => it.menuItemId === 'item-dg')?.suppAsked).toBe(true)

    // Le panier final contient toujours exactement les 3 items d'origine (aucune perte/duplication).
    expect(afterDg.cart.items).toHaveLength(3)
    expect(afterDg.cart.items.map((it) => it.menuItemId).sort()).toEqual(
      ['item-bobun', 'item-dg', 'item-nems'].sort(),
    )
  })

  it('un supplément choisi sur le premier item n’empêche pas l’enchaînement sur le second', () => {
    const cart: Cart = { items: [{ ...bobunItem }, { ...dgItem }] }
    const started = beginCheckout(cart, ctx)
    const picked = transition('SUPPLEMENTS_CHECKOUT', started.cart, '2', ctx) // Bœuf
    expect(picked.cart.items.find((it) => it.menuItemId === 'item-bobun')?.supplements).toEqual([
      { id: 'sup-boeuf', name: 'Bœuf', price: 1000 },
    ])
    const exited = transition('SUPPLEMENTS_CHECKOUT', picked.cart, '0', ctx)
    expect(exited.state).toBe('SUPPLEMENTS_CHECKOUT')
    expect(exited.replies).toEqual([
      copy.supplementsPrompt('Poulet DG', ctx.menu.categories[0].items[2].supplements!),
    ])
    // Bo Bun garde son supplément choisi malgré la rotation.
    expect(exited.cart.items.find((it) => it.menuItemId === 'item-bobun')?.supplements).toEqual([
      { id: 'sup-boeuf', name: 'Bœuf', price: 1000 },
    ])
  })
})

describe('SUPPLEMENTS_CHECKOUT — commandes globales', () => {
  it('"annuler" depuis SUPPLEMENTS_CHECKOUT → ACCUEIL, panier vidé', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const started = beginCheckout(cart, ctx)
    const r = transition('SUPPLEMENTS_CHECKOUT', started.cart, 'annuler', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart).toBe(EMPTY_CART)
    expect(r.replies).toEqual([copy.canceled])
  })

  it('"panier" depuis SUPPLEMENTS_CHECKOUT → récap, état inchangé (comme SUPPLEMENTS)', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const started = beginCheckout(cart, ctx)
    const r = transition('SUPPLEMENTS_CHECKOUT', started.cart, 'panier', ctx)
    expect(r.state).toBe('SUPPLEMENTS_CHECKOUT')
    expect(r.replies).toEqual([copy.cartRecap(started.cart)])
  })

  it('"menu" depuis SUPPLEMENTS_CHECKOUT → état MENU (comme SUPPLEMENTS)', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const started = beginCheckout(cart, ctx)
    const r = transition('SUPPLEMENTS_CHECKOUT', started.cart, 'menu', ctx)
    expect(r.state).toBe('MENU')
  })

  it('"humain" depuis SUPPLEMENTS_CHECKOUT → état HUMAIN (comme SUPPLEMENTS)', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const started = beginCheckout(cart, ctx)
    const r = transition('SUPPLEMENTS_CHECKOUT', started.cart, 'humain', ctx)
    expect(r.state).toBe('HUMAIN')
  })
})

describe('SUPPLEMENTS_CHECKOUT — non-régression flux texte', () => {
  it('MENU→"valider" n’est PAS branché sur SUPPLEMENTS_CHECKOUT même avec des suppléments dispo', () => {
    const cart: Cart = { items: [{ ...bobunItem }] }
    const r = transition('MENU', cart, 'valider', ctx)
    expect(r.state).toBe('MODE')
    expect(r.replies).toHaveLength(1) // pas de récap, comportement existant inchangé
  })

  it('l’état SUPPLEMENTS classique (ajout via MENU) reste inchangé', () => {
    const r = transition('MENU', EMPTY_CART, '1', ctx)
    expect(r.state).toBe('SUPPLEMENTS')
    const exit = transition('SUPPLEMENTS', r.cart, '0', ctx)
    expect(exit.state).toBe('MENU')
    expect(exit.replies[0]).toContain('✅ 1× Bo Bun ajouté au panier.')
  })
})
