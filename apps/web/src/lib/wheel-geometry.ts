// Géométrie pure de la roue QR (Fidélité v3), portée de cartelle
// (app/spin/[shopId]/page.tsx : createSegmentPath/segmentCenterAngle/extraSpins ;
// components/dashboard/WheelPreview.tsx : distributeSegments). Logique portée, pas le style.
// Aucune décision de tirage ici : le lot vient toujours du serveur (spin_wheel).

export interface WheelSeg {
  key: string
  label: string
  kind: 'prize' | 'lose' | 'retry'
  color: string
  imageUrl?: string | null
}

/**
 * Angle de rotation total pour amener le centre du segment `index` sous le pointeur (haut).
 * `rand` (0..1) est injecté par l'appelant (jamais `Math.random()` ici) pour rester testable.
 * `current` = rotation actuelle (deg). Le résultat est toujours strictement supérieur à
 * `current` (au moins `extraSpins` tours complets) : la roue ne tourne jamais en arrière.
 */
/**
 * Trouve l'index du segment visuel correspondant au résultat renvoyé par le serveur.
 * Aucune décision de tirage ici : le lot vient toujours du serveur. Renvoie -1 si aucun
 * segment ne correspond (config de lots désynchronisée du serveur) — l'appelant ne doit
 * alors PAS animer un atterrissage sur un autre segment que celui annoncé.
 */
export function indexForOutcome(segments: WheelSeg[], outcome: 'prize' | 'lose' | 'retry', prizeId?: string | null): number {
  return outcome === 'prize'
    ? segments.findIndex((s) => s.kind === 'prize' && s.key === prizeId)
    : segments.findIndex((s) => s.kind === outcome)
}

export function targetRotation(index: number, total: number, current: number, rand: number): number {
  const segmentAngle = 360 / total
  const segmentCenterAngle = index * segmentAngle + segmentAngle / 2 - 90
  const randomOffset = (rand - 0.5) * segmentAngle * 0.6
  const targetAngle = -segmentCenterAngle - 90 + randomOffset
  const distToTarget = (((targetAngle - (current % 360)) % 360) + 360) % 360
  const extraSpins = 5
  return current + extraSpins * 360 + distToTarget
}

/**
 * Path SVG d'un secteur en couronne (donut), viewBox `0 0 400 400`, centre `(200,200)`.
 * Porté de `createSegmentPath` (cartelle) : secteur `index` sur `total`, entre `innerRadius`
 * et `outerRadius`.
 */
export function segmentPath(index: number, total: number, outerRadius: number, innerRadius: number): string {
  const segmentAngle = 360 / total
  const startAngle = ((index * segmentAngle - 90) * Math.PI) / 180
  const endAngle = (((index + 1) * segmentAngle - 90) * Math.PI) / 180
  const cx = 200
  const cy = 200
  const x1 = cx + outerRadius * Math.cos(startAngle)
  const y1 = cy + outerRadius * Math.sin(startAngle)
  const x2 = cx + outerRadius * Math.cos(endAngle)
  const y2 = cy + outerRadius * Math.sin(endAngle)
  const x3 = cx + innerRadius * Math.cos(endAngle)
  const y3 = cy + innerRadius * Math.sin(endAngle)
  const x4 = cx + innerRadius * Math.cos(startAngle)
  const y4 = cy + innerRadius * Math.sin(startAngle)
  const largeArc = segmentAngle > 180 ? 1 : 0
  return `M ${x4} ${y4} L ${x1} ${y1} A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${x4} ${y4} Z`
}

/**
 * Répartit les segments pour éviter deux voisins de même `kind`, porté de
 * `WheelPreview.distributeSegments` (cartelle) : groupe par nature, puis entrelace les
 * groupes (le plus grand d'abord) en évitant de placer deux segments de même `kind` de suite.
 */
export function distributeSegments(segs: WheelSeg[]): WheelSeg[] {
  if (segs.length <= 2) return segs

  const groups = new Map<string, WheelSeg[]>()
  for (const seg of segs) {
    if (!groups.has(seg.kind)) groups.set(seg.kind, [])
    groups.get(seg.kind)!.push(seg)
  }

  const sortedGroups = Array.from(groups.values()).sort((a, b) => b.length - a.length)
  const result: WheelSeg[] = []
  const groupPointers = sortedGroups.map(() => 0)

  for (let i = 0; i < segs.length; i++) {
    let placed = false

    for (let g = 0; g < sortedGroups.length; g++) {
      const group = sortedGroups[g]
      const pointer = groupPointers[g]
      if (pointer >= group.length) continue

      const lastSegment = result[result.length - 1]
      if (!lastSegment || group[pointer].kind !== lastSegment.kind) {
        result.push(group[pointer])
        groupPointers[g]++
        placed = true
        break
      }
    }

    if (!placed) {
      for (let g = 0; g < sortedGroups.length; g++) {
        if (groupPointers[g] < sortedGroups[g].length) {
          result.push(sortedGroups[g][groupPointers[g]])
          groupPointers[g]++
          break
        }
      }
    }
  }

  return result
}
