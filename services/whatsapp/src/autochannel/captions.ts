import { buildStatusCaption, type CaptionDish } from '../autostatus/captions.js'

/**
 * Légende chaîne = légende statut (mêmes gabarits, réutilisés à l'identique — CA3) + CTA « Commander »
 * optionnel. Pas de vrai bouton interactif sur la chaîne (newsletters WhatsApp) : le CTA est un simple
 * lien wa.me appendé à la légende (cf. docs/superpowers/plans/2026-07-13-chaine-auto-premium.md,
 * « Décisions techniques figées »). `contactPhone` vide/absent → aucun lien ajouté, pas d'erreur.
 * PUR : ni effet de bord ni horloge.
 */
export function buildChannelCaption(dish: CaptionDish, templateIndex: number, contactPhone: string | null): string {
  const base = buildStatusCaption(dish, templateIndex)
  if (!contactPhone) return base
  const digits = contactPhone.replace(/\D/g, '')
  if (!digits) return base
  return `${base}\n👉 Commander : https://wa.me/${digits}`
}
