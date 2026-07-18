/**
 * Helpers purs de la carte de fidélité (pendant de `trigger.ts` pour la roue). Le lien pointe
 * vers la page carte publique `/f/<token>` (jeton HMAC signLoyaltyToken, cf. @goutatou/db/loyalty).
 * La carte est permanente : pas de « lien valable 72h » comme la roue, le même lien reste valide.
 */
export function buildCardLink(baseUrl: string, token: string): string {
  return `${baseUrl}/f/${token}`
}

/** Corps du message carte SANS le lien brut, pour accompagner le bouton interactif URL. */
export function cardMessageBody(): string {
  return (
    `💳 Voici votre *carte de fidélité* ! 🎁\n` +
    `Chaque commande vous rapproche d'un cadeau. Ouvrez votre carte pour suivre votre progression :`
  )
}

/** Message carte AVEC le lien (fallback texte du bouton, et réponse au mot-clé « fidélité »). */
export function cardMessage(link: string): string {
  return `${cardMessageBody()}\n${link}`
}
