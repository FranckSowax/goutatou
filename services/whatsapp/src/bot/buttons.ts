import type { BotState, Cart } from '@goutatou/db'
import { availableModes, flatMenuItems, type BotContext } from './machine.js'

export interface ButtonChoice {
  id: string
  title: string
}

/**
 * Boutons WhatsApp à proposer pour l'état RÉSULTANT d'une transition — couche processor
 * uniquement (cf. docs/superpowers/specs/2026-07-12-bot-boutons-design.md § Convention des
 * ids). La machine ignore tout de ce module : chaque choix a un id `in:<texte>` que le
 * processor retraduit en entrée texte machine au prochain message (ex. `in:3` → la machine
 * reçoit `"3"`, `in:oui` → `"oui"`). Titres NON tronqués ici — la troncature (limites
 * WhatsApp quick-reply/liste) est appliquée par l'appelant au moment de l'envoi, car elle
 * dépend du transport choisi (quick-reply vs liste), pas du contenu.
 *
 * `null` = pas de choix fermé standard pour cet état (ou rien à proposer, ex. aucun
 * supplément disponible) → l'appelant envoie la réponse en texte, comme avant ce module.
 */
export function buttonsForState(state: BotState, cart: Cart, ctx: BotContext): ButtonChoice[] | null {
  switch (state) {
    // idx = Number(text) - 1 ; modes[idx] (cf. machine.ts, case 'MODE') — id `in:<rang 1-based>`.
    case 'MODE': {
      const modes = availableModes(ctx)
      if (modes.length === 0) return null
      return modes.map((m, i) => ({ id: `in:${i + 1}`, title: m.label }))
    }

    // idx = Number(text) - 1 ; ctx.driveSlots[idx] (cf. machine.ts, case 'CRENEAU').
    case 'CRENEAU': {
      if (ctx.driveSlots.length === 0) return null
      return ctx.driveSlots.map((s, i) => ({ id: `in:${i + 1}`, title: s.label }))
    }

    // Suppléments du DERNIER item du panier (cible garantie par la machine, cf.
    // lastItemWithSupplements dans machine.ts) : idx = Number(text) - 1 ; supplements[idx] ;
    // "0"/"non" sort. "Non merci" (id in:0) toujours en dernier choix.
    case 'SUPPLEMENTS':
    case 'SUPPLEMENTS_CHECKOUT': {
      const lastItem = cart.items[cart.items.length - 1]
      if (!lastItem) return null
      const menuItem = flatMenuItems(ctx.menu).find((m) => m.id === lastItem.menuItemId)
      const supplements = menuItem?.supplements ?? []
      if (supplements.length === 0) return null
      const choices = supplements.map((s, i) => ({ id: `in:${i + 1}`, title: `${s.name} +${s.price} F` }))
      choices.push({ id: 'in:0', title: 'Non merci' })
      return choices
    }

    // text === 'oui' → confirme (cf. machine.ts, case 'CONFIRMATION') ; 'annuler' est un
    // mot-clé GLOBAL (évalué avant le switch, toutes les états) qui vide le panier et annule —
    // comportement identique à '2'/'non' localement à CONFIRMATION, mais vérifié partout.
    case 'CONFIRMATION':
      return [
        { id: 'in:oui', title: 'Oui' },
        { id: 'in:annuler', title: 'Annuler' },
      ]

    // text === 'airtel' / 'cash' (cf. machine.ts, case 'PAIEMENT'). Titres ≤ 20 chars
    // (QUICK_REPLY_TITLE_MAX) et discriminants dès le premier caractère (📱 vs 💵) : le
    // round-trip par titre (matchButtonInput) reste sûr même tronqué. Cash désactivé →
    // Airtel imposé, un seul bouton (spec paiement-commande § Décisions).
    case 'PAIEMENT': {
      const pay = ctx.payment
      if (!pay?.airtelEnabled || !pay.airtelNumber) return null
      const choices: ButtonChoice[] = [{ id: 'in:airtel', title: '📱 Airtel Money' }]
      if (pay.cashEnabled) {
        choices.push({
          id: 'in:cash',
          title: cart.mode === 'livraison' ? '💵 À la livraison' : '💵 À la récupération',
        })
      }
      return choices
    }

    default:
      return null
  }
}

/**
 * Retraduit un TITRE de bouton entrant en entrée machine (le suffixe de l'id `in:<texte>`).
 *
 * Pourquoi : le round-trip de l'id `in:<x>` n'est PAS garanti par WhatsApp/Whapi sur certains
 * canaux — un tap peut revenir sans id (ou en message texte), le processor ne dispose alors que
 * du TITRE affiché (« Non merci », « Œuf +300 F »…). Sans cette retraduction, la machine reçoit
 * le titre littéral, qu'elle ne reconnaît pas comme entrée valide (« 0 »/« non »/« 1 »…) →
 * re-prompt en boucle infinie (bug observé sur SUPPLEMENTS_CHECKOUT « Non merci »).
 *
 * On matche `body` aux choix fermés que le bot AURAIT offerts pour l'état courant, en tolérant la
 * troncature défensive appliquée à l'envoi (cf. processor `truncateTitle`) : le titre peut revenir
 * complet OU tronqué selon le canal. Match exact d'abord, puis préfixe UNIQUE (sécurise contre les
 * faux positifs). Renvoie le texte d'entrée machine (ex. « 0 », « 1 », « oui ») ou `null` si `body`
 * ne correspond à aucun bouton de cet état — auquel cas le processor garde `body` inchangé.
 *
 * PURE : aucun effet de bord, aucune dépendance au transport réellement utilisé.
 */
export function matchButtonInput(state: BotState, cart: Cart, ctx: BotContext, body: string): string | null {
  const choices = buttonsForState(state, cart, ctx)
  if (!choices || choices.length === 0) return null
  // Normalisation : trim, retrait des points de suite (« … » ou « ... » de troncature), minuscules.
  const norm = (s: string) => s.trim().replace(/[.…]+$/u, '').trim().toLowerCase()
  const b = norm(body)
  if (!b) return null
  const toInput = (c: ButtonChoice) => (c.id.startsWith('in:') ? c.id.slice(3) : c.id)

  // 1) Match exact sur le titre complet normalisé (couvre les titres courts non tronqués,
  //    ex. « Non merci », « Oui », « Œuf +300 F »).
  const exact = choices.find((c) => norm(c.title) === b)
  if (exact) return toInput(exact)

  // 2) Match par préfixe (le titre a pu être tronqué à l'envoi OU au retour) : on ne l'accepte
  //    que s'il est UNIQUE, pour éviter d'assigner un tap ambigu entre deux titres proches.
  const prefixed = choices.filter((c) => {
    const t = norm(c.title)
    return t.length > 0 && (t.startsWith(b) || b.startsWith(t))
  })
  if (prefixed.length === 1) return toInput(prefixed[0])

  return null
}
