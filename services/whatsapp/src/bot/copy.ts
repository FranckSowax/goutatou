import { type Cart, type SupplementLine, cartTotal, formatFcfa } from '@goutatou/db'
import { cardMessage } from '../loyalty/card-trigger.js'

function supplementsList(supplements: SupplementLine[]): string {
  return supplements.map((s, i) => `${i + 1}. ${s.name} +${formatFcfa(s.price)}`).join('\n')
}

/** Fiche pratique restaurant, telle qu'injectée dans le contexte machine (champs vides omis). */
export interface BotProfile {
  address?: string
  contactPhone?: string
  hoursText?: string
  deliveryInfo?: string
  infoExtra?: string
}

export const copy = {
  welcome: (name: string, botWelcome?: string) => {
    const custom = botWelcome?.trim()
    if (custom) {
      return `${custom}\nTapez *menu* pour commander, *infos* pour nos horaires et contacts.`
    }
    return `Bienvenue chez ${name} ! 👋\nTapez *menu* pour voir la carte, *infos* pour nos horaires et contacts, ou *humain* pour parler à quelqu'un.`
  },
  menuFooter:
    `\nEnvoyez le *numéro* d'un plat pour l'ajouter (ex. *1* ou *1x2* pour 2 portions).\n` +
    `*panier* : voir votre commande · *valider* : passer commande · *annuler* : tout effacer`,
  added: (name: string, qty: number) =>
    `✅ ${qty}× ${name} ajouté au panier.\nAjoutez d'autres plats, ou tapez *valider* pour passer commande.`,
  notUnderstood: `Désolé, je n'ai pas compris 😅 Tapez *menu* pour voir la carte.`,
  emptyCart: `Votre panier est vide. Tapez *menu* pour voir la carte.`,
  cartRecap: (cart: Cart) => {
    const lines = cart.items.flatMap((it) => {
      const main = `• ${it.qty}× ${it.name} — ${formatFcfa(it.unitPrice * it.qty)}`
      const subs = (it.supplements ?? []).map((s) => `  ↳ ${s.name} +${formatFcfa(s.price)}`)
      return [main, ...subs]
    })
    return `🛒 *Votre panier*\n${lines.join('\n')}\n\n*Total : ${formatFcfa(cartTotal(cart))}*`
  },
  supplementsPrompt: (itemName: string, supplements: SupplementLine[]) =>
    `Avec supplément pour ${itemName} ?\n0. Non merci\n${supplementsList(supplements)}`,
  supplementsAgain: (supplements: SupplementLine[]) =>
    `Autre supplément ? (0 pour continuer)\n0. Non merci\n${supplementsList(supplements)}`,
  canceled: `Commande annulée. Tapez *menu* quand vous voulez recommencer. 👍`,
  human: `Un membre de l'équipe va vous répondre ici. Tapez *bot* pour reprendre la commande automatique.`,
  chooseMode: (options: string[]) =>
    `Comment souhaitez-vous récupérer votre commande ?\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
  chooseSlot: (slots: { label: string }[]) =>
    `🚗 Choisissez votre créneau de retrait :\n${slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}`,
  askAddress: `🛵 Indiquez votre adresse de livraison (quartier + repère) :`,
  /**
   * Question de l'étape PAIEMENT (spec paiement-commande) : posée uniquement quand le resto a
   * activé Airtel Money (numéro renseigné). Les entrées machine attendues sont « airtel » et
   * « cash » (les boutons quick-reply les retraduisent via `in:airtel`/`in:cash`, cf. buttons.ts) —
   * le texte guide donc les clients qui répondent au clavier. cash désactivé → Airtel imposé,
   * la ligne cash disparaît.
   */
  choosePayment: (cart: Cart, cashEnabled: boolean) => {
    const cashLine = cashEnabled
      ? `\n💵 Répondez *cash* pour régler ${cart.mode === 'livraison' ? 'à la livraison' : 'à la récupération'}.`
      : ''
    return (
      `💳 Comment réglez-vous vos ${formatFcfa(cartTotal(cart))} ?\n` +
      `📱 Répondez *airtel* pour payer par Airtel Money.${cashLine}`
    )
  },
  /** Instructions de transfert Airtel Money : montant formaté, numéro du resto, nom du titulaire. */
  airtelInstructions: (total: string, number: string, holderName: string) =>
    `📱 Envoyez *${total}* au *${number}* (${holderName}).\n` +
    `Puis répondez ici avec la *référence* de la transaction (ou tapez *payé*).`,
  /** Re-prompt doux de l'état PAIEMENT_REF (référence trop courte/vide). */
  paymentRefPrompt:
    `Envoyez la *référence* de votre transaction Airtel Money (ou tapez *payé* une fois le transfert effectué). 🙏`,
  confirm: (cart: Cart, modeLabel: string, detail?: string) =>
    `${copy.cartRecap(cart)}\n\nMode : ${modeLabel}${detail ? `\n${detail}` : ''}\n\n` +
    `1. ✅ Confirmer\n2. ❌ Annuler`,
  infos: (profile?: BotProfile) => {
    const lines: string[] = []
    if (profile?.address) lines.push(`📍 ${profile.address}`)
    if (profile?.hoursText) lines.push(`🕒 ${profile.hoursText}`)
    if (profile?.deliveryInfo) lines.push(`🛵 ${profile.deliveryInfo}`)
    if (profile?.contactPhone) lines.push(`📞 ${profile.contactPhone}`)
    if (profile?.infoExtra) lines.push(`ℹ️ ${profile.infoExtra}`)
    if (lines.length === 0) {
      return `Contactez-nous directement sur ce numéro pour toute question !`
    }
    return `ℹ️ *Infos pratiques*\n${lines.join('\n')}`
  },
  /**
   * roue désactivée/absente (ctx.wheel non fourni) → présentation courte du programme,
   * PAS de tour gratuit v1 (cf. spec marketing QR opt-in). roue activée → pitch + progression,
   * calculée par modulo comme le déclencheur réel (shouldOfferSpin) : jamais négative,
   * jamais à 0 (le seuil suivant est toujours entre 1 et triggerOrders commandes plus loin).
   */
  roue: (wheel?: { enabled: boolean; triggerOrders: number; orderCount: number }) => {
    if (!wheel?.enabled) {
      return (
        `🎡 *Programme fidélité*\n` +
        `Commandez régulièrement et gagnez la chance de remporter un cadeau à la roue de la fortune ! ` +
        `Revenez bientôt, le programme sera activé prochainement. 🎁`
      )
    }
    const remaining = wheel.triggerOrders - (wheel.orderCount % wheel.triggerOrders)
    const plural = remaining > 1 ? 's' : ''
    return (
      `🎡 *Roue de la fortune*\n` +
      `Commandez régulièrement et tentez de gagner un cadeau ! 🎁\n` +
      `Plus que ${remaining} commande${plural} avant votre tour de roue !`
    )
  },
  /**
   * Carte de fidélité (remplace la roue quand loyalty_enabled). `loyalty` est injecté par le
   * processor (repo + génération du jeton), la machine reste pure. Activée → corps chaleureux +
   * lien perso vers la carte. Désactivée/absente → présentation courte du programme, sans lien.
   */
  loyaltyCard: (loyalty?: { enabled: boolean; cardLink: string }) => {
    if (!loyalty?.enabled || !loyalty.cardLink) {
      return (
        `💳 *Carte de fidélité*\n` +
        `Commandez régulièrement et cumulez des tampons pour débloquer des cadeaux ! 🎁\n` +
        `Le programme sera activé prochainement, revenez bientôt.`
      )
    }
    return cardMessage(loyalty.cardLink)
  },
  promos: `✅ C'est noté ! Vous recevrez nos offres et promotions ici. Envoyez STOP à tout moment pour vous désinscrire.`,
}
