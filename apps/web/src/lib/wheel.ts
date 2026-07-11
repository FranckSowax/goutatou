export function targetRotationDeg(index: number, count: number, turns = 5): number {
  if (count <= 0) return turns * 360
  const sector = 360 / count
  // Ramener le centre du secteur `index` en haut (0°) : rotation = tours - index*sector
  const align = (360 - index * sector) % 360
  return turns * 360 + align
}

export type WheelSegmentKind = 'prize' | 'lose' | 'retry'

/**
 * Détermine l'index du segment sur lequel la roue doit s'arrêter, d'après l'outcome
 * renvoyé par /api/roue/spin (aucune décision de tirage ici, uniquement le mapping
 * résultat serveur → position visuelle). Pour outcome 'prize', matche par id de lot
 * (pas par libellé : deux lots peuvent partager le même libellé). Retombe sur 0 si
 * le segment attendu est introuvable (configuration modifiée entre chargement de la
 * page et réponse du tirage), pour ne jamais planter l'animation.
 */
export function findSpinIndex(
  segments: { kind: WheelSegmentKind; id?: string }[],
  outcome: WheelSegmentKind,
  prizeId?: string | null,
): number {
  const idx =
    outcome === 'prize'
      ? segments.findIndex((s) => s.kind === 'prize' && s.id === prizeId)
      : segments.findIndex((s) => s.kind === outcome)
  return idx >= 0 ? idx : 0
}

/**
 * Prochaine rotation (en degrés) strictement supérieure à la précédente : au moins
 * `minExtraTurns` tours pleins au-delà du tour courant, puis alignement sur le
 * segment cible. Garantit que chaque nouveau tir (y compris un rejeu) tourne
 * visuellement vers l'avant, jamais en arrière.
 */
export function nextRotationDeg(prevRotationDeg: number, alignDeg: number, minExtraTurns = 6): number {
  return (Math.floor(prevRotationDeg / 360) + minExtraTurns) * 360 + alignDeg
}

/** Date d'expiration d'un gain, au format FR lisible (ex. "11 août 2026"). */
export function formatExpiryFr(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}
