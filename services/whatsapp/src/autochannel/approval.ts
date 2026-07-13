/**
 * Validation des posts chaîne auto — logique PURE (parsing des ids de boutons + copies FR),
 * mirror strict de `autostatus/approval.ts` (cf. docs/superpowers/plans/2026-07-13-chaine-auto-
 * premium.md, § Tâche CA5). Aucun effet de bord ici : le processor (impur) orchestre la
 * lecture/écriture repo et l'envoi Whapi ; ce module ne fait que décider quoi faire et quoi dire.
 * `isManagerSender` est réutilisé tel quel depuis `autostatus/approval.ts` (pas de duplication).
 */

export type ChannelApprovalAction = 'approve' | 'reject' | 'regen' | 'cancel'

export interface ParsedChannelApprovalButton {
  action: ChannelApprovalAction
  postId: string
}

// Convention ids boutons gérant chaîne (préfixe `ch`, cf. plan § Convention ids boutons
// validation chaîne) : parallèle strict aux statuts (`stapp:`/`strej:`/`streg:`/`stcan:`).
const PREFIX_TO_ACTION: Array<[string, ChannelApprovalAction]> = [
  ['chapp:', 'approve'],
  ['chrej:', 'reject'],
  ['chreg:', 'regen'],
  ['chcan:', 'cancel'],
]

/**
 * Parse un id de bouton entrant en action de validation + postId. `null` si l'id ne commence
 * par aucun des 4 préfixes connus (pas un bouton de validation chaîne — le processor doit
 * retomber sur le flux machine normal, ou sur l'interception des boutons statut) ou si le
 * postId est vide.
 */
export function parseChannelApprovalButton(id: string): ParsedChannelApprovalButton | null {
  for (const [prefix, action] of PREFIX_TO_ACTION) {
    if (id.startsWith(prefix)) {
      const postId = id.slice(prefix.length)
      return postId.length > 0 ? { action, postId } : null
    }
  }
  return null
}

/**
 * Copies FR figées — parallèles à `APPROVAL_COPY` (autostatus), adaptées « post chaîne ».
 */
export const CHANNEL_APPROVAL_COPY = {
  notAvailable: "Cette validation n'est plus disponible.",
  alreadyHandled: 'Ce post chaîne a déjà été traité.',
  approved: "✅ Post chaîne validé — publication à l'heure prévue.",
  rejectPrompt: 'Que souhaitez-vous faire ?',
  regenerateTitle: '🔄 Régénérer',
  cancelTitle: '🚫 Annuler',
  canceled: '🚫 Post chaîne annulé.',
  cancelError: 'Refusé par le gérant.',
  reapprovePrompt: 'Publier ce post chaîne ?',
  validateTitle: '✅ Valider',
  refuseTitle: '❌ Refuser',
  noDishToRegenerate: 'Aucun autre plat disponible avec photo pour régénérer.',
} as const
