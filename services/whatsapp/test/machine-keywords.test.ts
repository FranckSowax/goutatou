import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { transition, type BotContext } from '../src/bot/machine.js'

const baseCtx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [{ id: 'slot-1', label: '12h00 – 12h15' }],
  menu: {
    categories: [{ name: 'Plats', items: [{ id: 'item-bobun', name: 'Bo Bun', price: 4500 }] }],
  },
}

describe('commande globale "roue"', () => {
  it('activée, progression en cours → pitch + "plus que X commandes"', () => {
    const ctx: BotContext = { ...baseCtx, wheel: { enabled: true, triggerOrders: 5, orderCount: 3 } }
    const r = transition('ACCUEIL', EMPTY_CART, 'roue', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart).toEqual(EMPTY_CART)
    expect(r.replies[0]).toContain('🎡 *Roue de la fortune*')
    expect(r.replies[0]).toContain('Plus que 2 commandes avant votre tour de roue !')
  })

  it('activée, singulier (1 commande restante)', () => {
    const ctx: BotContext = { ...baseCtx, wheel: { enabled: true, triggerOrders: 5, orderCount: 4 } }
    const r = transition('ACCUEIL', EMPTY_CART, 'roue', ctx)
    expect(r.replies[0]).toContain('Plus que 1 commande avant votre tour de roue !')
  })

  it('activée, au seuil exact (orderCount multiple de triggerOrders) → repart pour un tour complet', () => {
    // Le client vient de recevoir son tour au jalon précédent (ex. 5/5) : le prochain
    // jalon est 10, donc il reste bien triggerOrders (5) commandes, jamais 0.
    const ctx: BotContext = { ...baseCtx, wheel: { enabled: true, triggerOrders: 5, orderCount: 5 } }
    const r = transition('ACCUEIL', EMPTY_CART, 'roue', ctx)
    expect(r.replies[0]).toContain('Plus que 5 commandes avant votre tour de roue !')
  })

  it('activée, aucune commande encore (orderCount 0) → il reste triggerOrders commandes', () => {
    const ctx: BotContext = { ...baseCtx, wheel: { enabled: true, triggerOrders: 5, orderCount: 0 } }
    const r = transition('ACCUEIL', EMPTY_CART, 'roue', ctx)
    expect(r.replies[0]).toContain('Plus que 5 commandes avant votre tour de roue !')
  })

  it('désactivée (wheel.enabled false) → présentation courte du programme, pas de progression', () => {
    const ctx: BotContext = { ...baseCtx, wheel: { enabled: false, triggerOrders: 5, orderCount: 3 } }
    const r = transition('ACCUEIL', EMPTY_CART, 'roue', ctx)
    expect(r.replies[0]).toContain('🎡 *Programme fidélité*')
    expect(r.replies[0]).not.toContain('Plus que')
  })

  it('ctx.wheel absent (non injecté par le processor) → même présentation que désactivée', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'roue', baseCtx)
    expect(r.replies[0]).toContain('🎡 *Programme fidélité*')
  })

  it('en pleine commande (état MODE) → état et panier conservés', () => {
    const cart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 2 }] }
    const ctx: BotContext = { ...baseCtx, wheel: { enabled: true, triggerOrders: 5, orderCount: 1 } }
    const r = transition('MODE', cart, '  ROUE  ', ctx)
    expect(r.state).toBe('MODE')
    expect(r.cart).toEqual(cart)
    expect(r.replies[0]).toContain('🎡')

    // le flow reprend normalement ensuite, comme pour "infos"/"panier".
    const resumed = transition('MODE', r.cart, '3', ctx)
    expect(resumed.state).toBe('CONFIRMATION')
  })

  it('HUMAIN reste silencieux même sur "roue" (garde HUMAIN avant les commandes globales)', () => {
    const ctx: BotContext = { ...baseCtx, wheel: { enabled: true, triggerOrders: 5, orderCount: 1 } }
    const r = transition('HUMAIN', EMPTY_CART, 'roue', ctx)
    expect(r.state).toBe('HUMAIN')
    expect(r.replies).toHaveLength(0)
  })
})

describe('commande globale "fidélité"/"carte"', () => {
  const loyaltyCtx: BotContext = { ...baseCtx, loyalty: { enabled: true, cardLink: 'https://x/f/TOK' } }

  it('fidélité activée → corps carte + lien perso, état/panier conservés', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'fidélité', loyaltyCtx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart).toEqual(EMPTY_CART)
    expect(r.replies[0]).toContain('carte de fidélité')
    expect(r.replies[0]).toContain('https://x/f/TOK')
  })

  it('accepte "fidelite" (sans accent) et "carte"', () => {
    expect(transition('ACCUEIL', EMPTY_CART, 'fidelite', loyaltyCtx).replies[0]).toContain('https://x/f/TOK')
    expect(transition('MENU', EMPTY_CART, '  CARTE  ', loyaltyCtx).replies[0]).toContain('https://x/f/TOK')
  })

  it('fidélité désactivée/absente → présentation courte, sans lien', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'carte', { ...baseCtx, loyalty: { enabled: false, cardLink: '' } })
    expect(r.replies[0]).toContain('💳 *Carte de fidélité*')
    expect(r.replies[0]).not.toContain('http')
  })

  it('HUMAIN reste silencieux même sur "carte"', () => {
    const r = transition('HUMAIN', EMPTY_CART, 'carte', loyaltyCtx)
    expect(r.state).toBe('HUMAIN')
    expect(r.replies).toHaveLength(0)
  })

  it('"roue" renvoie la CARTE quand la fidélité est activée (roue remplacée)', () => {
    const ctx: BotContext = {
      ...baseCtx,
      loyalty: { enabled: true, cardLink: 'https://x/f/TOK' },
      wheel: { enabled: true, triggerOrders: 5, orderCount: 1 },
    }
    const r = transition('ACCUEIL', EMPTY_CART, 'roue', ctx)
    expect(r.replies[0]).toContain('https://x/f/TOK')
    expect(r.replies[0]).not.toContain('Roue de la fortune')
  })
})

describe('commande globale "promos"', () => {
  it('répond la confirmation opt-in fixe, état et panier conservés', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'promos', baseCtx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart).toEqual(EMPTY_CART)
    expect(r.replies[0]).toBe(
      `✅ C'est noté ! Vous recevrez nos offres et promotions ici. Envoyez STOP à tout moment pour vous désinscrire.`,
    )
  })

  it('insensible à la casse et aux espaces', () => {
    const r = transition('MENU', EMPTY_CART, '  PROMOS  ', baseCtx)
    expect(r.replies[0]).toContain(`C'est noté`)
  })

  it('en pleine commande (état MODE) → état et panier conservés, le flow reprend ensuite', () => {
    const cart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] }
    const r = transition('MODE', cart, 'promos', baseCtx)
    expect(r.state).toBe('MODE')
    expect(r.cart).toEqual(cart)

    const resumed = transition('MODE', r.cart, '3', baseCtx)
    expect(resumed.state).toBe('CONFIRMATION')
    expect(resumed.cart.mode).toBe('sur_place')
  })

  it('HUMAIN reste silencieux même sur "promos" (garde HUMAIN avant les commandes globales)', () => {
    const r = transition('HUMAIN', EMPTY_CART, 'promos', baseCtx)
    expect(r.state).toBe('HUMAIN')
    expect(r.replies).toHaveLength(0)
  })
})

describe('non-régression — menu/infos inchangés après ajout de roue/promos', () => {
  it('menu toujours accessible et fonctionnel', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'menu', baseCtx)
    expect(r.state).toBe('MENU')
    expect(r.replies[0]).toContain('1. Bo Bun')
  })

  it('infos toujours accessible (fiche absente → message générique)', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'infos', baseCtx)
    expect(r.replies[0]).toBe(`Contactez-nous directement sur ce numéro pour toute question !`)
  })
})
