export function buildWheelLink(baseUrl: string, token: string): string {
  return `${baseUrl}/roue?t=${token}`
}

export function wheelMessage(link: string): string {
  return (
    `🎉 Bravo, vous avez gagné un tour de *roue de la fortune* ! 🎡\n` +
    `Tentez votre chance ici (lien valable 72h) :\n${link}`
  )
}

/** Corps du message roue SANS le lien brut, pour accompagner le bouton interactif URL. */
export function wheelMessageBody(): string {
  return `🎉 Bravo, vous avez gagné un tour de *roue de la fortune* ! 🎡\nTentez votre chance ici (lien valable 72h) :`
}
