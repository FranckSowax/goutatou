import { type Cart, cartTotal, formatFcfa } from '@goutatou/db'

export const copy = {
  welcome: (name: string) =>
    `Bienvenue chez ${name} ! 👋\nTapez *menu* pour voir la carte, ou *humain* pour parler à quelqu'un.`,
  menuFooter:
    `\nEnvoyez le *numéro* d'un plat pour l'ajouter (ex. *1* ou *1x2* pour 2 portions).\n` +
    `*panier* : voir votre commande · *valider* : passer commande · *annuler* : tout effacer`,
  added: (name: string, qty: number) =>
    `✅ ${qty}× ${name} ajouté au panier.\nAjoutez d'autres plats, ou tapez *valider* pour passer commande.`,
  notUnderstood: `Désolé, je n'ai pas compris 😅 Tapez *menu* pour voir la carte.`,
  emptyCart: `Votre panier est vide. Tapez *menu* pour voir la carte.`,
  cartRecap: (cart: Cart) => {
    const lines = cart.items.map((it) => `• ${it.qty}× ${it.name} — ${formatFcfa(it.unitPrice * it.qty)}`)
    return `🛒 *Votre panier*\n${lines.join('\n')}\n\n*Total : ${formatFcfa(cartTotal(cart))}*`
  },
  canceled: `Commande annulée. Tapez *menu* quand vous voulez recommencer. 👍`,
  human: `Un membre de l'équipe va vous répondre ici. Tapez *bot* pour reprendre la commande automatique.`,
  chooseMode: (options: string[]) =>
    `Comment souhaitez-vous récupérer votre commande ?\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`,
  chooseSlot: (slots: { label: string }[]) =>
    `🚗 Choisissez votre créneau de retrait :\n${slots.map((s, i) => `${i + 1}. ${s.label}`).join('\n')}`,
  askAddress: `🛵 Indiquez votre adresse de livraison (quartier + repère) :`,
  confirm: (cart: Cart, modeLabel: string, detail?: string) =>
    `${copy.cartRecap(cart)}\n\nMode : ${modeLabel}${detail ? `\n${detail}` : ''}\n\n` +
    `1. ✅ Confirmer\n2. ❌ Annuler`,
}
