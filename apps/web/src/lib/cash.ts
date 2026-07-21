// Z de caisse — calcul de la journée. Pur et testable : c'est la définition de « encaissé »,
// le chiffre sur lequel le gérant compare son tiroir. Toute la valeur du Z tient à cette règle,
// elle doit rester explicite et vérifiable.

export interface CashOrder {
  total: number
  status: string
  mode: string
  source: string
  payment_method: string | null
  payment_status: string
}

export interface CashDay {
  /** Argent réellement rentré en espèces (commandes remises au client, payées à la remise). */
  cashTotal: number
  /** Argent réellement rentré par Airtel Money (paiement vérifié par le restaurant). */
  airtelTotal: number
  /** Annoncé mais pas encore rentré : Airtel à vérifier + commandes pas encore récupérées. */
  pendingTotal: number
  canceledTotal: number
  /** Commandes du jour hors annulées. */
  ordersCount: number
  canceledCount: number
  /** Répartition du chiffre du jour (hors annulées) par mode puis par canal. */
  byMode: Record<string, number>
  bySource: Record<string, number>
}

const EMPTY: CashDay = {
  cashTotal: 0,
  airtelTotal: 0,
  pendingTotal: 0,
  canceledTotal: 0,
  ordersCount: 0,
  canceledCount: 0,
  byMode: {},
  bySource: {},
}

function bump(acc: Record<string, number>, key: string, amount: number): void {
  if (!key) return
  acc[key] = (acc[key] ?? 0) + amount
}

/**
 * Agrège une journée de commandes en un Z de caisse.
 *
 * Règle « encaissé » = **argent réellement rentré** :
 *  - espèces : la commande a été **remise au client** (`recuperee`) et n'est pas payée en Airtel
 *    (`payment_method` null = paiement à la remise, convention historique) ;
 *  - Airtel : le restaurant a **vérifié** le paiement (`payment_status = 'paye'`) ;
 *  - en attente : Airtel déclaré mais non vérifié, et toute commande non annulée pas encore
 *    récupérée (l'argent arrivera à la remise).
 *
 * Une commande annulée ne compte ni dans l'encaissé, ni dans l'attente, ni dans les répartitions.
 */
export function computeCashDay(orders: CashOrder[]): CashDay {
  const out: CashDay = { ...EMPTY, byMode: {}, bySource: {} }

  for (const o of orders) {
    const amount = Number(o.total) || 0

    if (o.status === 'annulee') {
      out.canceledTotal += amount
      out.canceledCount += 1
      continue
    }

    out.ordersCount += 1
    bump(out.byMode, o.mode, amount)
    bump(out.bySource, o.source, amount)

    if (o.payment_method === 'airtel') {
      if (o.payment_status === 'paye') out.airtelTotal += amount
      else out.pendingTotal += amount
      continue
    }

    if (o.status === 'recuperee') out.cashTotal += amount
    else out.pendingTotal += amount
  }

  return out
}

/** Total réellement encaissé sur la journée (espèces + Airtel vérifié). */
export function cashDayTotal(day: Pick<CashDay, 'cashTotal' | 'airtelTotal'>): number {
  return day.cashTotal + day.airtelTotal
}

/** Écart de caisse : compté − attendu. Négatif = manquant. `null` si rien n'a été compté. */
export function cashDifference(countedCash: number | null | undefined, cashTotal: number): number | null {
  if (countedCash === null || countedCash === undefined || Number.isNaN(countedCash)) return null
  return countedCash - cashTotal
}
