// Éligibilité pure de la roue QR (Fidélité v3) : 1 tour / numéro / `wheel_spin_period_days`.
// Vérifiée à `/api/roue/unlock` ET ré-vérifiée à `/api/roue/spin` (autoritaire) — cf.
// docs/superpowers/plans/2026-07-13-roue-qr-sociale.md.

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * `lastSpinAt` = date du dernier tour du client (null = jamais). Renvoie l'éligibilité et,
 * si bloqué, la date à partir de laquelle il pourra rejouer. `periodDays <= 0` → toujours
 * éligible.
 */
export function checkEligibility(
  lastSpinAt: Date | null,
  periodDays: number,
  now: Date,
): { eligible: true } | { eligible: false; nextEligibleAt: Date } {
  if (periodDays <= 0 || lastSpinAt === null) return { eligible: true }

  const nextEligibleAt = new Date(lastSpinAt.getTime() + periodDays * DAY_MS)
  if (now.getTime() >= nextEligibleAt.getTime()) return { eligible: true }

  return { eligible: false, nextEligibleAt }
}
