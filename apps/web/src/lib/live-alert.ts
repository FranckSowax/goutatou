// Cuisine Live — décision d'alerte pure (aucun DOM, aucun Web Audio).
// Consommé par l'overlay client (CL2) qui écoute le canal Supabase Realtime sur `orders`.
//
// Idempotence : `postgres_changes` peut redélivrer un événement, et pour les UPDATE la présence de
// `payload.old` dépend du REPLICA IDENTITY de la table côté Postgres (rien ne garantit qu'il soit
// fourni). Le `Set` passé par l'appelant est donc la SEULE protection fiable contre la double alerte,
// pas la comparaison old/new : si `oldArrivedAt` est `undefined` (payload.old absent) mais que
// `row.arrived_at` est déjà renseigné, on considère prudemment que c'est une arrivée — et c'est le
// `Set` (clé `arr:<id>`) qui empêche toute ré-alerte si le même événement est redélivré ensuite.

export type LiveEvent =
  | { kind: 'order'; id: string; code: string; amount: number }
  | { kind: 'paiement'; id: string; code: string; amount: number }
  | { kind: 'arrival'; id: string; code: string; note: string | null }

export function decideAlert(
  evt: {
    type: 'INSERT' | 'UPDATE'
    row: {
      id: string
      order_number: number
      total: number
      mode: string
      arrived_at: string | null
      arrival_note: string | null
      /** 'na' | 'a_verifier' | 'paye' — paiement à la commande (Airtel manuel). */
      payment_status: string
      paid_at: string | null
    }
    oldArrivedAt?: string | null
    oldPaymentStatus?: string
  },
  seen: Set<string>,
): LiveEvent | null {
  const { type, row, oldArrivedAt, oldPaymentStatus } = evt

  if (type === 'INSERT') {
    if (seen.has(row.id)) return null
    seen.add(row.id)
    // Paiement Airtel en attente de vérification : le client a DÉJÀ envoyé son argent — alerte
    // dédiée « paiement à vérifier » (ambre), distincte de « nouvelle commande ». Pas de double
    // alerte pour le même événement : cet INSERT ne déclenche QUE l'alerte paiement, et c'est la
    // validation « Paiement reçu ✓ » (UPDATE payment_status → 'paye' ci-dessous, clé `pay:<id>`)
    // qui déclenchera ensuite l'alerte « nouvelle commande ». Une commande cash reste sur la
    // branche `order` classique, inchangée.
    if (row.payment_status === 'a_verifier') {
      return { kind: 'paiement', id: row.id, code: String(row.order_number), amount: row.total }
    }
    return { kind: 'order', id: row.id, code: String(row.order_number), amount: row.total }
  }

  // UPDATE : paiement confirmé — transition a_verifier → paye (l'ancienne valeur vient du payload
  // Realtime, REPLICA IDENTITY FULL sur `orders`). Même garde de fraîcheur que l'arrivée Drive
  // ci-dessous : un onglet fraîchement ouvert (Set vide, `payload.old` éventuellement absent) ne
  // doit pas sonner pour un paiement confirmé il y a longtemps quand la ligne bouge à nouveau.
  const wasPaid = oldPaymentStatus === 'paye'
  const isPaid = row.payment_status === 'paye'
  if (isPaid && !wasPaid) {
    const paidAtMs = Date.parse(row.paid_at ?? '')
    if (!Number.isNaN(paidAtMs) && Date.now() - paidAtMs <= 60_000) {
      const key = `pay:${row.id}`
      if (!seen.has(key)) {
        seen.add(key)
        return { kind: 'order', id: row.id, code: String(row.order_number), amount: row.total }
      }
    }
    // Périmé ou déjà vu : on laisse la main à la logique d'arrivée (un UPDATE peut porter les deux).
  }

  // UPDATE : une arrivée est une transition null/absent → non-null.
  const wasArrived = oldArrivedAt != null
  const isArrived = row.arrived_at != null
  if (!isArrived || wasArrived) return null

  // Garde de fraîcheur — INDÉPENDANTE de la disponibilité de `payload.old` : un onglet fraîchement
  // ouvert démarre avec un `Set` vide (aucun historique de session), donc n'importe quelle
  // commande déjà arrivée AVANT l'ouverture de l'onglet ressemble à une arrivée neuve dès le
  // premier UPDATE qu'il reçoit sur cette ligne (ex. gérant qui passe la commande en "Récupérée"
  // minutes après l'arrivée réelle). Sans cette garde : overlay plein écran + carillon pour une
  // arrivée vieille de plusieurs minutes. `arrived_at` invalide/non parsable → `Date.parse` renvoie
  // `NaN` → traité comme périmé (`Number.isNaN` explicite, on ne compte pas sur `NaN > 60_000`
  // qui vaut toujours `false` et laisserait passer une date illisible) : jamais de crash, jamais
  // d'alerte sur une donnée qu'on ne sait pas dater.
  const arrivedAtMs = Date.parse(row.arrived_at as string)
  if (Number.isNaN(arrivedAtMs) || Date.now() - arrivedAtMs > 60_000) return null

  const key = `arr:${row.id}`
  if (seen.has(key)) return null
  seen.add(key)
  return { kind: 'arrival', id: row.id, code: String(row.order_number), note: row.arrival_note }
}
