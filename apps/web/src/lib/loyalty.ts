/**
 * Logique pure de la carte de fidélité (compteur cumulatif de commandes + paliers).
 * Aucun accès réseau / DB : testé unitairement dans apps/web/test/loyalty.test.ts.
 */

export interface Reward {
  threshold: number
  label: string
}

/**
 * Prochain palier à atteindre : le plus petit seuil STRICTEMENT supérieur au compteur.
 * Retourne `null` si tous les paliers sont déjà atteints (ou s'il n'y en a aucun).
 * `rewards` peut arriver non trié.
 */
export function nextTier(
  stamps: number,
  rewards: Reward[],
): { threshold: number; label: string; remaining: number } | null {
  let best: Reward | null = null
  for (const r of rewards) {
    if (r.threshold > stamps && (best === null || r.threshold < best.threshold)) {
      best = r
    }
  }
  if (!best) return null
  return { threshold: best.threshold, label: best.label, remaining: best.threshold - stamps }
}

export type TierStatus = 'a_venir' | 'atteint' | 'recupere'

/**
 * Statut d'un palier pour un client :
 * - `recupere` : le lot a déjà été remis (threshold présent dans redeemedThresholds).
 * - `atteint` : le compteur a atteint le seuil mais le lot n'a pas encore été remis.
 * - `a_venir` : le seuil n'est pas encore atteint.
 */
export function tierStatus(
  threshold: number,
  stamps: number,
  redeemedThresholds: number[],
): TierStatus {
  if (redeemedThresholds.includes(threshold)) return 'recupere'
  if (stamps >= threshold) return 'atteint'
  return 'a_venir'
}
