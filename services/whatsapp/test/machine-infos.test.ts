import { describe, expect, it } from 'vitest'
import { EMPTY_CART, type Cart } from '@goutatou/db'
import { transition, type BotContext } from '../src/bot/machine.js'

const baseCtx: BotContext = {
  restaurantName: 'Chez Test',
  driveEnabled: true,
  driveSlots: [
    { id: 'slot-1', label: '12h00 – 12h15' },
    { id: 'slot-2', label: '12h15 – 12h30' },
  ],
  menu: {
    categories: [{ name: 'Plats', items: [{ id: 'item-bobun', name: 'Bo Bun', price: 4500 }] }],
  },
}

const fullProfile = {
  address: '123 Avenue de la Paix, Libreville',
  hoursText: 'Tous les jours 11h–22h',
  deliveryInfo: 'Livraison sur Libreville, 1 500 FCFA',
  contactPhone: '+241 77 00 00 01',
  infoExtra: 'Paiement Mobile Money accepté',
}

describe('non-régression — fiche absente (ctx.profile/botWelcome non renseignés)', () => {
  it('rejoue le scénario de commande existant à l’identique, hors rappel *infos* dans l’accueil', () => {
    // ACCUEIL : accueil par défaut, désormais avec le rappel *infos* (seule différence assumée
    // par rapport au comportement pré-S2 : le reste du texte et le flow sont inchangés).
    const welcome = transition('ACCUEIL', EMPTY_CART, 'bonjour', baseCtx)
    expect(welcome.state).toBe('ACCUEIL')
    expect(welcome.replies[0]).toBe(
      `Bienvenue chez Chez Test ! 👋\nTapez *menu* pour voir la carte, *infos* pour nos horaires et contacts, ou *humain* pour parler à quelqu'un.`,
    )

    // menu → MENU
    const menu = transition('ACCUEIL', EMPTY_CART, 'Menu', baseCtx)
    expect(menu.state).toBe('MENU')
    expect(menu.replies[0]).toContain('1. Bo Bun')

    // ajout d'un plat
    const added = transition('MENU', EMPTY_CART, '1', baseCtx)
    expect(added.cart.items).toEqual([
      { menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [] },
    ])
    expect(added.replies[0]).toContain('Bo Bun')

    // valider → MODE
    const validated = transition('MENU', added.cart, 'valider', baseCtx)
    expect(validated.state).toBe('MODE')
    expect(validated.replies[0]).toContain('1. 🚗 Drive')

    // sur place → CONFIRMATION directe
    const moded = transition('MODE', added.cart, '3', baseCtx)
    expect(moded.state).toBe('CONFIRMATION')
    expect(moded.cart.mode).toBe('sur_place')

    // confirmer → createOrder, retour ACCUEIL
    const confirmed = transition('CONFIRMATION', moded.cart, '1', baseCtx)
    expect(confirmed.createOrder).toBe(true)
    expect(confirmed.state).toBe('ACCUEIL')
    expect(confirmed.cart.items).toHaveLength(1) // le processor lit le panier PUIS le réinitialise

    // humain / bot inchangés
    const humain = transition('MENU', EMPTY_CART, 'humain', baseCtx)
    expect(humain.state).toBe('HUMAIN')
    const silent = transition('HUMAIN', EMPTY_CART, 'bonjour ?', baseCtx)
    expect(silent.replies).toHaveLength(0)
    const back = transition('HUMAIN', EMPTY_CART, 'bot', baseCtx)
    expect(back.state).toBe('ACCUEIL')
    expect(back.replies[0]).toBe(welcome.replies[0])
  })
})

describe('welcome personnalisé (bot_welcome renseigné)', () => {
  it('utilise bot_welcome verbatim, suivi du rappel fixe menu/infos', () => {
    const ctx: BotContext = { ...baseCtx, botWelcome: 'Bienvenue au Snack Ambiance, on vous attend !' }
    const r = transition('ACCUEIL', EMPTY_CART, 'salut', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.replies[0]).toBe(
      `Bienvenue au Snack Ambiance, on vous attend !\nTapez *menu* pour commander, *infos* pour nos horaires et contacts.`,
    )
  })
})

describe('commande globale "infos"', () => {
  it('fiche complète → toutes les lignes, dans l’ordre adresse/horaires/livraison/téléphone/extra', () => {
    const ctx: BotContext = { ...baseCtx, profile: fullProfile }
    const r = transition('ACCUEIL', EMPTY_CART, 'infos', ctx)
    expect(r.state).toBe('ACCUEIL')
    expect(r.cart).toEqual(EMPTY_CART)
    expect(r.replies[0]).toBe(
      `ℹ️ *Infos pratiques*\n` +
      `📍 123 Avenue de la Paix, Libreville\n` +
      `🕒 Tous les jours 11h–22h\n` +
      `🛵 Livraison sur Libreville, 1 500 FCFA\n` +
      `📞 +241 77 00 00 01\n` +
      `ℹ️ Paiement Mobile Money accepté`,
    )
  })

  it('fiche partielle → seulement les champs remplis, "INFOS" insensible à la casse', () => {
    const ctx: BotContext = {
      ...baseCtx,
      profile: { hoursText: 'Lun–Sam 11h–21h', contactPhone: '+241 77 00 00 02' },
    }
    const r = transition('MENU', EMPTY_CART, 'INFOS', ctx)
    expect(r.replies[0]).toBe(`ℹ️ *Infos pratiques*\n🕒 Lun–Sam 11h–21h\n📞 +241 77 00 00 02`)
  })

  it('fiche entièrement vide (ctx.profile absent) → message générique', () => {
    const r = transition('ACCUEIL', EMPTY_CART, 'infos', baseCtx)
    expect(r.replies[0]).toBe(`Contactez-nous directement sur ce numéro pour toute question !`)
  })

  it('en pleine commande (état MODE) → état et panier conservés, le flow reprend normalement ensuite', () => {
    const cart: Cart = { items: [{ menuItemId: 'item-bobun', name: 'Bo Bun', unitPrice: 4500, qty: 2 }] }
    const ctx: BotContext = { ...baseCtx, profile: fullProfile }

    const r = transition('MODE', cart, '  infos  ', ctx)
    expect(r.state).toBe('MODE')
    expect(r.cart).toEqual(cart)
    expect(r.replies[0]).toContain('📍 123 Avenue de la Paix, Libreville')

    // Comme "panier" mid-flow, l'état MODE n'est pas perdu : le client peut ensuite
    // répondre normalement au prompt de choix de mode (jamais réaffiché par "infos").
    const resumed = transition('MODE', r.cart, '3', ctx)
    expect(resumed.state).toBe('CONFIRMATION')
    expect(resumed.cart.mode).toBe('sur_place')
  })

  it('HUMAIN reste silencieux même sur "infos" (garde HUMAIN avant les commandes globales)', () => {
    const ctx: BotContext = { ...baseCtx, profile: fullProfile }
    const r = transition('HUMAIN', EMPTY_CART, 'infos', ctx)
    expect(r.state).toBe('HUMAIN')
    expect(r.replies).toHaveLength(0)
  })
})
