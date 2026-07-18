import { normalizeGabonPhone } from './lp/wa'

/**
 * Email technique déterministe d'un employé, dérivé de son numéro WhatsApp. Jamais exposé à
 * l'utilisateur : sert d'identifiant GoTrue pour un produit sans email. Déterministe → le même
 * numéro donne toujours le même compte (login par numéro et invitation retombent dessus).
 * Renvoie `null` si le numéro n'est pas un numéro gabonais valide.
 */
export const STAFF_EMAIL_DOMAIN = 'staff.goutatou.app'

export function staffEmailFromPhone(input: string): string | null {
  const digits = normalizeGabonPhone(input)
  if (!digits) return null
  return `wa-${digits}@${STAFF_EMAIL_DOMAIN}`
}
