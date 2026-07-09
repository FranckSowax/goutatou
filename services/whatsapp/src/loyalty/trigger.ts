export function buildWheelLink(baseUrl: string, token: string): string {
  return `${baseUrl}/roue?t=${token}`
}

export function wheelMessage(link: string): string {
  return (
    `🎉 Bravo, vous avez gagné un tour de *roue de la fortune* ! 🎡\n` +
    `Tentez votre chance ici (lien valable 72h) :\n${link}`
  )
}
