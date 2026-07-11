/**
 * Rendu du bloc « infos » tel que le client le voit dans WhatsApp — copie légère
 * du format du bot (contrat S2), dupliquée ici volontairement pour ne pas
 * importer le bot depuis le web (services/whatsapp est un paquet à part).
 */
export type BotInfosProfile = {
  address: string | null
  hoursText: string | null
  deliveryInfo: string | null
  contactPhone: string | null
  infoExtra: string | null
}

export function renderBotInfosPreview(profile: BotInfosProfile): string {
  const lines: string[] = []
  if (profile.address) lines.push(`📍 ${profile.address}`)
  if (profile.hoursText) lines.push(`🕒 ${profile.hoursText}`)
  if (profile.deliveryInfo) lines.push(`🛵 ${profile.deliveryInfo}`)
  if (profile.contactPhone) lines.push(`📞 ${profile.contactPhone}`)
  if (profile.infoExtra) lines.push(`ℹ️ ${profile.infoExtra}`)

  if (lines.length === 0) {
    return 'Contactez-nous directement sur ce numéro pour toute question !'
  }
  return ['ℹ️ *Infos pratiques*', ...lines].join('\n')
}

const WELCOME_REMINDER = 'Tapez *menu* pour commander, *infos* pour nos horaires et contacts.'

/** Aperçu de l'accueil personnalisé — nul si non personnalisé (le texte par défaut est géré côté bot). */
export function renderBotWelcomePreview(botWelcome: string): string | null {
  const custom = botWelcome.trim()
  if (!custom) return null
  return `${custom}\n\n${WELCOME_REMINDER}`
}
