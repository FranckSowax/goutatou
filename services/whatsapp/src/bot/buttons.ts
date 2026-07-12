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

    default:
      return null
  }
}
