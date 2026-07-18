import {
  EMPTY_CART,
  type BotState,
  type Cart,
  type MenuForBot,
  type OrderMode,
  type SupplementLine,
  cartTotal,
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
  /**
   * Progression roue de la fortune pour CE client, injectée par le processor (repo) sur
   * la seule commande *roue* (pas chargée sur chaque message). Absente si le mot-clé n'est
   * pas celui en cours de traitement — cf. shouldOfferSpin/loyalty pour la sémantique du seuil.
   */
  wheel?: { enabled: boolean; triggerOrders: number; orderCount: number }
  /**
   * Carte de fidélité pour CE client, injectée par le processor (repo + génération du jeton) sur
   * les seuls mots-clés carte/fidélité/roue. `enabled` reflète `restaurants.loyalty_enabled` ;
   * `cardLink` est le lien perso `/f/<token>`. Absente si aucun de ces mots-clés n'est traité.
   */
  loyalty?: { enabled: boolean; cardLink: string }
  /**
   * Réglages paiement du restaurant (migration 0038, spec paiement-commande), chargés par
   * `getBotContext`. Absent (tests/fixtures historiques) OU `airtelEnabled=false` OU numéro
   * manquant → l'étape PAIEMENT est SAUTÉE : CONFIRMATION « oui » crée la commande directement,
   * comportement actuel strictement inchangé (défaut prod : payment_airtel_enabled=false).
   */
  payment?: {
    cashEnabled: boolean
    airtelEnabled: boolean
    airtelNumber: string | null
    airtelName: string | null
  }
}

export interface TransitionResult {
  state: BotState
  cart: Cart
  replies: string[]
  createOrder?: boolean
}

export function flatMenuItems(
  menu: MenuForBot,
): { id: string; name: string; price: number; supplements?: SupplementLine[]; photoUrl?: string | null; waProductId?: string | null }[] {
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
  { mode: 'sur_place', label: '🥡 À emporter' },
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

/** Item du panier à `index` + suppléments disponibles pour ce plat (menu), null si absent. */
function itemWithSupplements(
  cart: Cart, ctx: BotContext, index: number,
): { item: Cart['items'][number]; index: number; supplements: SupplementLine[] } | null {
  const item = cart.items[index]
  if (!item) return null
  const menuItem = flatMenuItems(ctx.menu).find((m) => m.id === item.menuItemId)
  const supplements = menuItem?.supplements ?? []
  return { item, index, supplements }
}

/** Dernier item du panier + suppléments disponibles pour ce plat (menu). */
function lastItemWithSupplements(
  cart: Cart, ctx: BotContext,
): { item: Cart['items'][number]; index: number; supplements: SupplementLine[] } | null {
  return itemWithSupplements(cart, ctx, cart.items.length - 1)
}

/**
 * Index du premier item du panier ayant des suppléments disponibles (menu) et pas encore
 * demandés (suppAsked absent/false) — -1 si aucun. Sert à SUPPLEMENTS_CHECKOUT/beginCheckout
 * pour enchaîner les plats importés sans suppléments choisis.
 */
function nextUnaskedSupplementIndex(cart: Cart, ctx: BotContext): number {
  const menuItems = flatMenuItems(ctx.menu)
  return cart.items.findIndex((it) => {
    if (it.suppAsked) return false
    const menuItem = menuItems.find((m) => m.id === it.menuItemId)
    return (menuItem?.supplements?.length ?? 0) > 0
  })
}

/** Déplace l'item à `index` en dernière position du panier (no-op s'il y est déjà). */
function moveToLast(cart: Cart, index: number): Cart {
  if (index < 0 || index === cart.items.length - 1) return cart
  const items = [...cart.items]
  const [item] = items.splice(index, 1)
  items.push(item)
  return { ...cart, items }
}

/**
 * Place l'item à `index` en dernière position et construit le prompt suppléments pour lui
 * (cible garantie = dernier item, comme SUPPLEMENTS). Retourne le panier réordonné + la
 * réplique à envoyer.
 */
function promptForSupplementAt(cart: Cart, ctx: BotContext, index: number): { cart: Cart; reply: string } {
  const moved = moveToLast(cart, index)
  const target = itemWithSupplements(moved, ctx, moved.items.length - 1)!
  return { cart: moved, reply: copy.supplementsPrompt(target.item.name, target.supplements) }
}

/**
 * Démarre le paiement pour un panier importé depuis l'extérieur de la machine (panier WhatsApp
 * natif entrant, cf. processor + spec catalogue § Conversation) — PAS un état/branche existant :
 * addition pure, `transition` n'appelle jamais cette fonction. Contrairement au chemin
 * MENU→"valider" (qui n'affiche PAS de récap, le client l'ayant déjà vu au fil des ajouts), ici
 * le client n'a rien vu construire le panier : le récap (copy.cartRecap, texte identique à
 * celui de "panier"/CONFIRMATION) précède donc la question du mode (copy.chooseMode, mêmes
 * libellés/helpers que "valider" — availableModes(ctx)).
 *
 * Si le panier contient au moins un item avec des suppléments disponibles (menu) pas encore
 * demandés, on ne saute PAS directement au mode : on cible ce plat en dernière position et on
 * bascule sur SUPPLEMENTS_CHECKOUT (mêmes règles de sélection que SUPPLEMENTS), avec le récap
 * du panier tel qu'importé (ordre inchangé) suivi de la question suppléments. Le flux texte
 * MENU→"valider" n'est PAS branché ici : il continue d'aller droit à MODE (zéro régression).
 */
export function beginCheckout(cart: Cart, ctx: BotContext): TransitionResult {
  if (!cart.items.length) return result('MENU', cart, [copy.emptyCart])
  const idx = nextUnaskedSupplementIndex(cart, ctx)
  if (idx !== -1) {
    const { cart: moved, reply } = promptForSupplementAt(cart, ctx, idx)
    return result('SUPPLEMENTS_CHECKOUT', moved, [copy.cartRecap(cart), reply])
  }
  const modes = availableModes(ctx)
  return result('MODE', cart, [copy.cartRecap(cart), copy.chooseMode(modes.map((m) => m.label))])
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
  // Mots-clés carte de fidélité : renvoient le lien perso de la carte (ctx.loyalty injecté par le
  // processor). « roue » est conservé mais, quand la fidélité est activée, il renvoie la carte —
  // la roue est remplacée par la carte de fidélité (cf. spec Lot 3).
  if (text === 'fidélité' || text === 'fidelite' || text === 'carte') {
    return result(state, cart, [copy.loyaltyCard(ctx.loyalty)])
  }
  if (text === 'roue') {
    if (ctx.loyalty?.enabled) return result(state, cart, [copy.loyaltyCard(ctx.loyalty)])
    return result(state, cart, [copy.roue(ctx.wheel)])
  }
  if (text === 'promos') return result(state, cart, [copy.promos])
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

    // Variante de SUPPLEMENTS pour un panier importé (beginCheckout) : mêmes règles de
    // sélection/dédup/invalide, mais la sortie (0/non) enchaîne sur le PROCHAIN item du panier
    // ayant des suppléments dispo non demandés (au lieu de revenir direct au flux MENU), et ne
    // revient à MODE (avec récap) que lorsque plus aucun item n'a de suppléments en attente.
    case 'SUPPLEMENTS_CHECKOUT': {
      const ctxItem = lastItemWithSupplements(cart, ctx)
      if (!ctxItem || ctxItem.supplements.length === 0) {
        // Garde-fou : rien à proposer, on repart comme beginCheckout sans suppléments.
        const modes = availableModes(ctx)
        return result('MODE', cart, [copy.cartRecap(cart), copy.chooseMode(modes.map((m) => m.label))])
      }
      const { item, index, supplements } = ctxItem
      const chosen = item.supplements ?? []

      if (text === '0' || text === 'non') {
        const items = cart.items.map((it, i) => (i === index ? { ...it, suppAsked: true } : it))
        const updatedCart = { ...cart, items }
        const nextIdx = nextUnaskedSupplementIndex(updatedCart, ctx)
        if (nextIdx !== -1) {
          const { cart: moved, reply } = promptForSupplementAt(updatedCart, ctx, nextIdx)
          return result('SUPPLEMENTS_CHECKOUT', moved, [reply])
        }
        const modes = availableModes(ctx)
        return result('MODE', updatedCart, [copy.cartRecap(updatedCart), copy.chooseMode(modes.map((m) => m.label))])
      }

      const idx = Number(text) - 1
      const pick = text !== '' && Number.isInteger(idx) ? supplements[idx] : undefined
      if (pick) {
        const alreadyChosen = chosen.some((s) => s.id === pick.id)
        if (!alreadyChosen) {
          const updatedItem = { ...item, supplements: [...chosen, pick] }
          const items = cart.items.map((it, i) => (i === index ? updatedItem : it))
          return result('SUPPLEMENTS_CHECKOUT', { ...cart, items }, [copy.supplementsAgain(supplements)])
        }
        return result('SUPPLEMENTS_CHECKOUT', cart, [copy.supplementsAgain(supplements)])
      }

      // Entrée invalide : on redemande (même prompt que celui affiché en dernier).
      const prompt = chosen.length > 0
        ? copy.supplementsAgain(supplements)
        : copy.supplementsPrompt(item.name, supplements)
      return result('SUPPLEMENTS_CHECKOUT', cart, [prompt])
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
        // Étape PAIEMENT uniquement quand le resto a activé Airtel ET renseigné son numéro
        // (spec paiement-commande § Décisions) — sinon flux actuel strictement inchangé :
        // le processor crée la commande et envoie la confirmation avec le numéro.
        if (ctx.payment?.airtelEnabled && ctx.payment.airtelNumber) {
          return result('PAIEMENT', cart, [copy.choosePayment(cart, ctx.payment.cashEnabled)])
        }
        return result('ACCUEIL', cart, [], true)
      }
      if (text === '2' || text === 'non') return result('ACCUEIL', EMPTY_CART, [copy.canceled])
      const modeLabel = MODE_DEFS.find((m) => m.mode === cart.mode)?.label ?? ''
      return result('CONFIRMATION', cart, [copy.confirm(cart, modeLabel)])
    }

    case 'PAIEMENT': {
      const pay = ctx.payment
      // Garde-fou : on ne peut arriver ici que via CONFIRMATION avec Airtel actif — si la
      // config a disparu entre-temps (réglages modifiés en cours de conversation), on retombe
      // sur le flux actuel plutôt que de bloquer le client.
      if (!pay?.airtelEnabled || !pay.airtelNumber) return result('ACCUEIL', cart, [], true)
      if (text === 'cash' && pay.cashEnabled) {
        return result('ACCUEIL', { ...cart, payment: 'cash' }, [], true)
      }
      if (text === 'airtel') {
        return result('PAIEMENT_REF', cart, [
          copy.airtelInstructions(
            formatFcfa(cartTotal(cart)), pay.airtelNumber, pay.airtelName ?? ctx.restaurantName),
        ])
      }
      // Entrée invalide (dont « cash » quand le cash est désactivé) : on repose la question.
      return result('PAIEMENT', cart, [copy.choosePayment(cart, pay.cashEnabled)])
    }

    case 'PAIEMENT_REF': {
      // Référence de transaction Airtel : tout texte ≥ 3 caractères, ou « payé »/« paye ».
      // Les mots-clés globaux (annuler, humain…) restent évalués avant ce switch.
      const ref = input.trim()
      if (text === 'payé' || text === 'paye' || ref.length >= 3) {
        return result('ACCUEIL', { ...cart, payment: 'airtel', paymentRef: ref }, [], true)
      }
      return result('PAIEMENT_REF', cart, [copy.paymentRefPrompt])
    }
  }
}
