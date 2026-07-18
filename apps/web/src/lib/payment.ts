// Paiement à la commande — helpers purs (aucun style ici, les composants choisissent
// les variantes/tokens). Cf. docs/superpowers/specs/2026-07-18-paiement-commande-design.md.

export interface PaymentBadgeInfo {
  label: string
  /** pending = Airtel à vérifier (ambre), paid = Airtel confirmé (vert), cash = à la remise (discret). */
  tone: 'pending' | 'paid' | 'cash'
}

/**
 * Badge paiement d'une carte commande. `null` quand `payment_method` est absent
 * (commande d'avant la fonctionnalité, ou resto sans paiement configuré) : aucun badge,
 * comportement inchangé.
 */
export function paymentBadge(method: string | null, status: string): PaymentBadgeInfo | null {
  if (method === 'airtel') {
    return status === 'paye'
      ? { label: '📱 Airtel ✓', tone: 'paid' }
      : { label: '📱 Airtel — à vérifier', tone: 'pending' }
  }
  if (method === 'cash') return { label: '💵 À la remise', tone: 'cash' }
  return null
}

/**
 * Ligne « Paiement : … » du ticket imprimable. `null` si pas de méthode (ligne omise).
 * La référence Airtel n'est ajoutée que si présente.
 */
export function paymentTicketLine(method: string | null, status: string, ref: string | null): string | null {
  if (method === 'airtel') {
    const base = status === 'paye' ? 'Paiement : Airtel ✓' : 'Paiement : Airtel (à vérifier)'
    return ref ? `${base} · réf ${ref}` : base
  }
  if (method === 'cash') return 'Paiement : à la remise'
  return null
}
