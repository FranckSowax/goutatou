// Libellés FR et mise en forme des répartitions du Z de caisse. Pur (aucun accès réseau ni React)
// pour rester testable : c'est ce qui traduit les clés techniques stockées en base (`sur_place`,
// `whatsapp`, …) en français lisible sur le papier du Z.
//
// Les clés inconnues ne sont jamais masquées : une commande d'un mode futur doit apparaître dans
// le total plutôt que disparaître silencieusement du récapitulatif.

const MODE_LABELS: Record<string, string> = {
  sur_place: '🥡 À emporter',
  drive: '🚗 Drive',
  livraison: '🛵 Livraison',
}

const SOURCE_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  comptoir: 'Comptoir',
  web: 'Site',
}

/** Libellé FR d'un mode de retrait ; la clé brute si le mode est inconnu. */
export function modeLabel(key: string): string {
  return MODE_LABELS[key] ?? key
}

/** Libellé FR d'un canal de commande ; la clé brute si le canal est inconnu. */
export function sourceLabel(key: string): string {
  return SOURCE_LABELS[key] ?? key
}

export interface BreakdownRow {
  key: string
  label: string
  amount: number
  /** Part du total, en pourcentage entier (0 si le total est nul). */
  share: number
}

/**
 * Transforme une ventilation `{ cle: montant }` en lignes affichables, triées du plus gros au plus
 * petit montant (à montant égal : ordre alphabétique des clés, pour un rendu stable d'un soir à
 * l'autre). Les montants nuls ou négatifs sont écartés — ils n'apprennent rien au gérant.
 */
export function breakdownRows(
  record: Record<string, number> | null | undefined,
  labelOf: (key: string) => string,
): BreakdownRow[] {
  const entries = Object.entries(record ?? {}).filter(([, amount]) => Number(amount) > 0)
  const total = entries.reduce((sum, [, amount]) => sum + Number(amount), 0)
  return entries
    .map(([key, amount]) => ({
      key,
      label: labelOf(key),
      amount: Number(amount),
      share: total > 0 ? Math.round((Number(amount) / total) * 100) : 0,
    }))
    .sort((a, b) => (b.amount - a.amount) || a.key.localeCompare(b.key))
}

/** Formule FR de l'écart de caisse. `null` → rien compté ; 0 → caisse juste. */
export function differenceLabel(difference: number | null): string {
  if (difference === null) return 'Non compté'
  if (difference === 0) return 'Caisse juste'
  return difference < 0 ? 'manquant' : 'excédent'
}
