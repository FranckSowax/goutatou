import {
  EMPTY_CART,
  type BotState,
  type Cart,
  type MenuForBot,
  type OrderMode,
  type SupplementLine,
  formatFcfa,
} from '@goutatou/db'
import { copy, type BotProfile } from './copy.js'

export interface BotContext {
  restaurantName: string
  menu: MenuForBot
  driveEnabled: boolean
  driveSlots: { id: string; label: string }[]
  /** Fiche pratique restaurant (champs vides omis). Absente = fiche non renseignée. */
  profile?: BotProfile
  /** Message d'accueil personnalisé du restaurant. Absent/vide = accueil générique. */
  botWelcome?: string
}

export interface TransitionResult {
  state: BotState
  cart: Cart
  replies: string[]
  createOrder?: boolean
}

export function flatMenuItems(
  menu: MenuForBot,
): { id: string; name: string; price: number; supplements?: SupplementLine[]; photoUrl?: string | null }[] {
  return menu.categories.flatMap((c) => c.items)
}

export function renderMenu(ctx: BotContext): string {
  let index = 0
  const sections = ctx.menu.categories.map((cat) => {
    const rows = cat.items.map((it) => `${++index}. ${it.name} — ${formatFcfa(it.price)}`)
    return `*${cat.name}*\n${rows.join('\n')}`
  })
  return `🍽️ *Carte — ${ctx.restaurantName}*\n\n${sections.join('\n\n')}\n${copy.menuFooter}`
}

const MODE_DEFS: { mode: OrderMode; label: string }[] = [
  { mode: 'drive', label: '🚗 Drive (retrait sur créneau)' },
  { mode: 'livraison', label: '🛵 Livraison' },
  { mode: 'sur_place', label: '🍽️ Sur place' },
]

export function availableModes(ctx: BotContext): { mode: OrderMode; label: string }[] {
  return MODE_DEFS.filter((m) => m.mode !== 'drive' || ctx.driveEnabled)
}

function result(state: BotState, cart: Cart, replies: string[], createOrder?: boolean): TransitionResult {
  return { state, cart, replies, ...(createOrder ? { createOrder } : {}) }
}

/** Parse "3" ou "3x2" → { index: 3, qty: 2 } (1-based), sinon null. */
function parseItemInput(input: string): { index: number; qty: number } | null {
  const m = input.match(/^(\d{1,3})(?:\s*[xX*]\s*(\d{1,2}))?$/)
  if (!m) return null
  return { index: Number(m[1]), qty: m[2] ? Number(m[2]) : 1 }
}

function addToCart(
  cart: Cart,
  item: { id: string; name: string; price: number; supplements?: SupplementLine[] },
  qty: number,
): Cart {
  // Plat AVEC suppléments : toujours une NOUVELLE ligne (jamais de fusion), pour que
  // la ligne tout juste ajoutée soit garantie dernière (ciblage de l'état SUPPLEMENTS)
  // et que chaque occurrence porte son propre jeu de suppléments (sémantique LP B4).
  // Plat SANS suppléments : fusion par menuItemId, comportement v1 strictement inchangé.
  const hasSupplements = (item.supplements?.length ?? 0) > 0
  const existing = hasSupplements ? undefined : cart.items.find((it) => it.menuItemId === item.id)
  const items = existing
    ? cart.items.map((it) => (it.menuItemId === item.id ? { ...it, qty: it.qty + qty } : it))
    : [...cart.items, { menuItemId: item.id, name: item.name, unitPrice: item.price, qty, supplements: [] }]
  return { ...cart, items }
}

/** Dernier item du panier + suppléments disponibles pour ce plat (menu). */
function lastItemWithSupplements(
  cart: Cart, ctx: BotContext,
): { item: Cart['items'][number]; index: number; supplements: SupplementLine[] } | null {
  const index = cart.items.length - 1
  const item = cart.items[index]
  if (!item) return null
  const menuItem = flatMenuItems(ctx.menu).find((m) => m.id === item.menuItemId)
  const supplements = menuItem?.supplements ?? []
  return { item, index, supplements }
}

export function transition(state: BotState, cart: Cart, input: string, ctx: BotContext): TransitionResult {
  const text = input.trim().toLowerCase()

  // État HUMAIN : silence total sauf "bot"
  if (state === 'HUMAIN') {
    if (text === 'bot') return result('ACCUEIL', cart, [copy.welcome(ctx.restaurantName, ctx.botWelcome)])
    return result('HUMAIN', cart, [])
  }

  // Commandes globales
  if (text === 'menu') return result('MENU', cart, [renderMenu(ctx)])
  if (text === 'annuler') return result('ACCUEIL', EMPTY_CART, [copy.canceled])
  if (text === 'humain') return result('HUMAIN', cart, [copy.human])
  if (text === 'infos') return result(state, cart, [copy.infos(ctx.profile)])
  if (text === 'panier') {
    return result(state === 'ACCUEIL' ? 'MENU' : state, cart,
      [cart.items.length ? copy.cartRecap(cart) : copy.emptyCart])
  }

  switch (state) {
    case 'ACCUEIL':
      return result('ACCUEIL', cart, [copy.welcome(ctx.restaurantName, ctx.botWelcome)])

    case 'MENU': {
      if (text === 'valider') {
        if (!cart.items.length) return result('MENU', cart, [copy.emptyCart])
        const modes = availableModes(ctx)
        return result('MODE', cart, [copy.chooseMode(modes.map((m) => m.label))])
      }
      const parsed = parseItemInput(text)
      if (parsed) {
        const items = flatMenuItems(ctx.menu)
        const item = items[parsed.index - 1]
        if (item) {
          const next = addToCart(cart, item, parsed.qty)
          if (item.supplements && item.supplements.length > 0) {
            return result('SUPPLEMENTS', next, [copy.supplementsPrompt(item.name, item.supplements)])
          }
          return result('MENU', next, [copy.added(item.name, parsed.qty)])
        }
      }
      return result('MENU', cart, [copy.notUnderstood])
    }

    case 'SUPPLEMENTS': {
      const ctxItem = lastItemWithSupplements(cart, ctx)
      if (!ctxItem || ctxItem.supplements.length === 0) {
        // Garde-fou : rien à proposer, on revient au flux normal.
        return result('MENU', cart, [copy.notUnderstood])
      }
      const { item, index, supplements } = ctxItem
      const chosen = item.supplements ?? []

      if (text === '0' || text === 'non') {
        return result('MENU', cart, [copy.added(item.name, item.qty)])
      }

      const idx = Number(text) - 1
      const pick = text !== '' && Number.isInteger(idx) ? supplements[idx] : undefined
      if (pick) {
        const alreadyChosen = chosen.some((s) => s.id === pick.id)
        if (!alreadyChosen) {
          const updatedItem = { ...item, supplements: [...chosen, pick] }
          const items = cart.items.map((it, i) => (i === index ? updatedItem : it))
          return result('SUPPLEMENTS', { ...cart, items }, [copy.supplementsAgain(supplements)])
        }
        return result('SUPPLEMENTS', cart, [copy.supplementsAgain(supplements)])
      }

      // Entrée invalide : on redemande (même prompt que celui affiché en dernier).
      const prompt = chosen.length > 0
        ? copy.supplementsAgain(supplements)
        : copy.supplementsPrompt(item.name, supplements)
      return result('SUPPLEMENTS', cart, [prompt])
    }

    case 'MODE': {
      const modes = availableModes(ctx)
      const idx = Number(text) - 1
      const chosen = Number.isInteger(idx) ? modes[idx] : undefined
      if (!chosen) return result('MODE', cart, [copy.chooseMode(modes.map((m) => m.label))])
      const next: Cart = { ...cart, mode: chosen.mode }
      if (chosen.mode === 'drive') {
        return result('CRENEAU', next, [copy.chooseSlot(ctx.driveSlots)])
      }
      if (chosen.mode === 'livraison') return result('ADRESSE', next, [copy.askAddress])
      return result('CONFIRMATION', next, [copy.confirm(next, chosen.label)])
    }

    case 'CRENEAU': {
      const idx = Number(text) - 1
      const slot = Number.isInteger(idx) ? ctx.driveSlots[idx] : undefined
      if (!slot) return result('CRENEAU', cart, [copy.chooseSlot(ctx.driveSlots)])
      const next: Cart = { ...cart, driveSlotId: slot.id, driveSlotLabel: slot.label }
      return result('CONFIRMATION', next, [
        copy.confirm(next, '🚗 Drive', `Créneau : ${slot.label}`),
      ])
    }

    case 'ADRESSE': {
      if (text.length < 5) return result('ADRESSE', cart, [copy.askAddress])
      const next: Cart = { ...cart, address: input.trim() }
      return result('CONFIRMATION', next, [
        copy.confirm(next, '🛵 Livraison', `Adresse : ${input.trim()}`),
      ])
    }

    case 'CONFIRMATION': {
      if (text === '1' || text === 'confirmer' || text === 'oui') {
        // Le processor crée la commande et envoie la confirmation avec le numéro.
        return result('ACCUEIL', cart, [], true)
      }
      if (text === '2' || text === 'non') return result('ACCUEIL', EMPTY_CART, [copy.canceled])
      const modeLabel = MODE_DEFS.find((m) => m.mode === cart.mode)?.label ?? ''
      return result('CONFIRMATION', cart, [copy.confirm(cart, modeLabel)])
    }
  }
}
