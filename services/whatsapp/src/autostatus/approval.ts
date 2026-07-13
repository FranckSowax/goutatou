/**
 * Validation des statuts auto — logique PURE (parsing des ids de boutons + copies FR),
 * cf. docs/superpowers/specs/2026-07-13-validation-statuts-design.md § Réponse gérant.
 * Aucun effet de bord ici : le processor (impur) orchestre la lecture/écriture repo et
 * l'envoi Whapi ; ce module ne fait que décider quoi faire et quoi dire.
 */

export type ApprovalAction = 'approve' | 'reject' | 'regen' | 'cancel'

export interface ParsedApprovalButton {
  action: ApprovalAction
  statusId: string
}

// Convention ids boutons gérant (cf. spec § Modèle) : préfixe court + uuid du statut.
const PREFIX_TO_ACTION: Array<[string, ApprovalAction]> = [
  ['stapp:', 'approve'],
  ['strej:', 'reject'],
  ['streg:', 'regen'],
  ['stcan:', 'cancel'],
]

/**
 * Parse un id de bouton entrant en action de validation + statusId. `null` si l'id ne
 * commence par aucun des 4 préfixes connus (pas un bouton de validation — le processor
 * doit retomber sur le flux machine normal) ou si le statusId est vide.
 */
export function parseApprovalButton(id: string): ParsedApprovalButton | null {
  for (const [prefix, action] of PREFIX_TO_ACTION) {
    if (id.startsWith(prefix)) {
      const statusId = id.slice(prefix.length)
      return statusId.length > 0 ? { action, statusId } : null
    }
  }
  return null
}

/**
 * Copies FR figées — reprises verbatim du brief VS4 (cf. spec § Réponse gérant), centralisées
 * pour éviter la dérive processor/tests.
 */
export const APPROVAL_COPY = {
  notAvailable: "Cette validation n'est plus disponible.",
  alreadyHandled: 'Ce statut a déjà été traité.',
  approved: "✅ Statut validé — publication à l'heure prévue.",
  rejectPrompt: 'Que souhaitez-vous faire ?',
  regenerateTitle: '🔄 Régénérer',
  cancelTitle: '🚫 Annuler',
  canceled: '🚫 Statut annulé.',
  cancelError: 'Refusé par le gérant.',
  reapprovePrompt: 'Publier ce statut ?',
  validateTitle: '✅ Valider',
  refuseTitle: '❌ Refuser',
  noDishToRegenerate: 'Aucun autre plat disponible avec photo pour régénérer.',
} as const
