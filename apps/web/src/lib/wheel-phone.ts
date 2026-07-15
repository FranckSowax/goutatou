// Normalisation pure du numéro saisi sur la page publique de la roue QR (Fidélité v3).
// Volontairement générique (pas de préfixe pays imposé) : le champ accepte tout indicatif,
// contrairement à `normalizeGabonPhone` (apps/web/src/lib/lp/wa.ts) qui est spécifique Gabon.

/**
 * Normalise un numéro saisi en chiffres seuls (indicatif inclus). Renvoie null si invalide
 * (moins de 8 chiffres ou plus de 15).
 */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length < 8 || digits.length > 15) return null
  return digits
}
