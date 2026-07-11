import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { transition, type BotContext } from '../src/bot/machine.js'

const noSupplementsCtx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [
    { id: 'slot-1', label: '12h00 – 12h15' },
    { id: 'slot-2', label: '12h15 – 12h30' },
  ],
  menu: {
    categories: [
      { name: 'Plats', items: [{ id: 'item-bobun', name: 'Bo Bun', price: 4500 }] },
    ],
  },
}

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
        {
          id: 'item-bobun', name: 'Bo Bun', price: 4500,
          supplements: [
            { id: 'sup-oeuf', name: 'Œuf', price: 300 },
            { id: 'sup-boeuf', name: 'Bœuf', price: 1000 },
          ],
        },
        { id: 'item-nems', name: 'Nems (x4)', price: 2500 },
      ]},
    ],
  },
}

describe('non-régression — menu sans suppléments', () => {
  it('rejoue un scénario de commande complet, sorties identiques', () => {
    const r1 = transition('MENU', EMPTY_CART, '1', noSupplementsCtx)
    expect(r1.state).toBe('MENU')
    expect(r1.cart.items).toEqual([
      { menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [] },
    ])
    expect(r1.replies[0]).toContain('✅ 1× Bo Bun ajouté au panier.')

    const r2 = transition('MENU', r1.cart, 'valider', noSupplementsCtx)
    expect(r2.state).toBe('MODE')
    expect(r2.replies[0]).toContain('1. 🚗 Drive')

    const r3 = transition('MODE', r2.cart, '1', noSupplementsCtx)
    expect(r3.state).toBe('CRENEAU')

    const r4 = transition('CRENEAU', r3.cart, '2', noSupplementsCtx)
    expect(r4.state).toBe('CONFIRMATION')
    expect(r4.replies[0]).toContain('4 500 FCFA')
    expect(r4.replies[0]).not.toContain('↳')

    const r5 = transition('CONFIRMATION', r4.cart, '1', noSupplementsCtx)
    expect(r5.createOrder).toBe(true)
    expect(r5.state).toBe('ACCUEIL')
  })
})

describe('SUPPLEMENTS — entrée dans l’état', () => {
  it('plat avec suppléments → state SUPPLEMENTS + prompt numéroté', () => {
    const r = transition('MENU', EMPTY_CART, '1', ctx)
    expect(r.state).toBe('SUPPLEMENTS')
    expect(r.replies[0]).toBe(
      'Avec supplément pour Bo Bun ?\n0. Non merci\n1. Œuf +300 FCFA\n2. Bœuf +1 000 FCFA',
    )
    expect(r.cart.items).toEqual([
      { menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [] },
    ])
  })

  it('plat sans suppléments dans un menu qui en a par ailleurs → flux inchangé', () => {
    const r = transition('MENU', EMPTY_CART, '2', ctx)
    expect(r.state).toBe('MENU')
    expect(r.replies[0]).toContain('✅ 1× Nems (x4) ajouté au panier.')
  })
})

describe('SUPPLEMENTS — sélection', () => {
  it('sélection simple → ajouté au dernier item, re-prompt "Autre supplément"', () => {
    const started = transition('MENU', EMPTY_CART, '1', ctx)
    const r = transition('SUPPLEMENTS', started.cart, '1', ctx)
    expect(r.state).toBe('SUPPLEMENTS')
    expect(r.cart.items[0].supplements).toEqual([{ id: 'sup-oeuf', name: 'Œuf', price: 300 }])
    expect(r.replies[0]).toBe(
      'Autre supplément ? (0 pour continuer)\n0. Non merci\n1. Œuf +300 FCFA\n2. Bœuf +1 000 FCFA',
    )
  })

  it('multi-sélection via messages successifs', () => {
    const started = transition('MENU', EMPTY_CART, '1', ctx)
    const afterFirst = transition('SUPPLEMENTS', started.cart, '1', ctx)
    const afterSecond = transition('SUPPLEMENTS', afterFirst.cart, '2', ctx)
    expect(afterSecond.state).toBe('SUPPLEMENTS')
    expect(afterSecond.cart.items[0].supplements).toEqual([
      { id: 'sup-oeuf', name: 'Œuf', price: 300 },
      { id: 'sup-boeuf', name: 'Bœuf', price: 1000 },
    ])
  })

  it('doublon (même supplément choisi deux fois) → ignoré silencieusement', () => {
    const started = transition('MENU', EMPTY_CART, '1', ctx)
    const afterFirst = transition('SUPPLEMENTS', started.cart, '1', ctx)
    const afterDuplicate = transition('SUPPLEMENTS', afterFirst.cart, '1', ctx)
    expect(afterDuplicate.state).toBe('SUPPLEMENTS')
    expect(afterDuplicate.cart.items[0].supplements).toEqual([
      { id: 'sup-oeuf', name: 'Œuf', price: 300 },
    ])
    expect(afterDuplicate.replies[0]).toContain('Autre supplément ?')
  })

  it.each(['0', 'non', 'NON'])('"%s" termine la sélection → flux normal (état MENU)', (input) => {
    const started = transition('MENU', EMPTY_CART, '1', ctx)
    const r = transition('SUPPLEMENTS', started.cart, input, ctx)
    expect(r.state).toBe('MENU')
    expect(r.replies[0]).toBe(
      '✅ 1× Bo Bun ajouté au panier.\nAjoutez d\'autres plats, ou tapez *valider* pour passer commande.',
    )
    expect(r.cart.items).toEqual(started.cart.items)
  })

  it('entrée invalide → re-prompt FR avec la même liste', () => {
    const started = transition('MENU', EMPTY_CART, '1', ctx)
    const r = transition('SUPPLEMENTS', started.cart, '9', ctx)
    expect(r.state).toBe('SUPPLEMENTS')
    expect(r.replies[0]).toBe(
      'Avec supplément pour Bo Bun ?\n0. Non merci\n1. Œuf +300 FCFA\n2. Bœuf +1 000 FCFA',
    )

    const nonNumeric = transition('SUPPLEMENTS', started.cart, 'blabla', ctx)
    expect(nonNumeric.state).toBe('SUPPLEMENTS')
    expect(nonNumeric.cart.items).toEqual(started.cart.items)
  })

  it('entrée invalide après une sélection valide → re-prompt "Autre supplément"', () => {
    const started = transition('MENU', EMPTY_CART, '1', ctx)
    const afterFirst = transition('SUPPLEMENTS', started.cart, '1', ctx)
    const r = transition('SUPPLEMENTS', afterFirst.cart, '9', ctx)
    expect(r.state).toBe('SUPPLEMENTS')
    expect(r.replies[0]).toBe(
      'Autre supplément ? (0 pour continuer)\n0. Non merci\n1. Œuf +300 FCFA\n2. Bœuf +1 000 FCFA',
    )
  })
})

describe('SUPPLEMENTS — re-ajout d’un plat à suppléments (lignes séparées)', () => {
  it('re-ajouter le plat A après un plat B → NOUVELLE ligne en fin de panier, la sélection cible cette ligne', () => {
    // 1. Plat A (avec suppléments) + un supplément, puis 0.
    const a1 = transition('MENU', EMPTY_CART, '1', ctx)
    const a1sup = transition('SUPPLEMENTS', a1.cart, '1', ctx)
    const a1done = transition('SUPPLEMENTS', a1sup.cart, '0', ctx)
    expect(a1done.state).toBe('MENU')

    // 2. Plat B (sans suppléments).
    const b = transition('MENU', a1done.cart, '2', ctx)
    expect(b.state).toBe('MENU')
    expect(b.cart.items).toHaveLength(2)

    // 3. Re-ajout du plat A → ligne SÉPARÉE (pas de fusion avec la ligne 0).
    const a2 = transition('MENU', b.cart, '1', ctx)
    expect(a2.state).toBe('SUPPLEMENTS')
    expect(a2.cart.items).toHaveLength(3)
    expect(a2.cart.items[0]).toMatchObject({ menuItemId: 'item-bobun', qty: 1 })
    expect(a2.cart.items[2]).toMatchObject({ menuItemId: 'item-bobun', qty: 1, supplements: [] })

    // La sélection doit cibler la NOUVELLE ligne A (index 2), pas B ni l'ancienne A.
    const a2sup = transition('SUPPLEMENTS', a2.cart, '2', ctx)
    expect(a2sup.state).toBe('SUPPLEMENTS')
    expect(a2sup.cart.items[0].supplements).toEqual([{ id: 'sup-oeuf', name: 'Œuf', price: 300 }])
    expect(a2sup.cart.items[1].supplements).toEqual([])
    expect(a2sup.cart.items[2].supplements).toEqual([{ id: 'sup-boeuf', name: 'Bœuf', price: 1000 }])

    // Récap : deux lignes Bo Bun, chacune avec ses propres suppléments.
    const recap = transition('SUPPLEMENTS', a2sup.cart, 'panier', ctx)
    const lines = recap.replies[0].split('\n')
    expect(lines.filter((l) => l.includes('1× Bo Bun'))).toHaveLength(2)
    expect(recap.replies[0]).toContain('  ↳ Œuf +300 FCFA')
    expect(recap.replies[0]).toContain('  ↳ Bœuf +1 000 FCFA')
    // Total = (4500+300) + 2500 + (4500+1000) = 12 800
    expect(recap.replies[0]).toContain('*Total : 12 800 FCFA*')
  })

  it('plat sans suppléments : re-ajout fusionne toujours (comportement v1 inchangé)', () => {
    const once = transition('MENU', EMPTY_CART, '2', ctx)
    const twice = transition('MENU', once.cart, '2', ctx)
    expect(twice.cart.items).toHaveLength(1)
    expect(twice.cart.items[0]).toMatchObject({ menuItemId: 'item-nems', qty: 2 })
  })

  it('"1x2" sur un plat à suppléments → une nouvelle ligne qty 2, les suppléments s’y appliquent', () => {
    const r = transition('MENU', EMPTY_CART, '1x2', ctx)
    expect(r.state).toBe('SUPPLEMENTS')
    expect(r.cart.items).toEqual([
      { menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 2, supplements: [] },
    ])
    const picked = transition('SUPPLEMENTS', r.cart, '1', ctx)
    expect(picked.cart.items[0].qty).toBe(2)
    expect(picked.cart.items[0].supplements).toEqual([{ id: 'sup-oeuf', name: 'Œuf', price: 300 }])
  })
})

describe('SUPPLEMENTS — récap panier et total', () => {
  it('le récap liste les sous-lignes ↳ et le total inclut les suppléments', () => {
    const cart: Cart = {
      items: [
        {
          menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 2,
          supplements: [
            { id: 'sup-oeuf', name: 'Œuf', price: 300 },
            { id: 'sup-boeuf', name: 'Bœuf', price: 1000 },
          ],
        },
      ],
    }
    const r = transition('SUPPLEMENTS', cart, 'panier', ctx)
    expect(r.replies[0]).toContain('• 2× Bo Bun — 9 000 FCFA')
    expect(r.replies[0]).toContain('  ↳ Œuf +300 FCFA')
    expect(r.replies[0]).toContain('  ↳ Bœuf +1 000 FCFA')
    // Total = (4500 + 300 + 1000) * 2 = 11 600
    expect(r.replies[0]).toContain('*Total : 11 600 FCFA*')
  })
})
