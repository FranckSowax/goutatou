/**
 * Géométrie pure des charts SVG (aucune dépendance, aucun DOM). Testée en isolation dans
 * test/charts-geometry.test.ts — les composants (AreaChart/BarChart/HBarList) ne font que
 * du rendu au-dessus de ces fonctions.
 */

/** Échelle linéaire value → range. domainMax<=0 (pas de données exploitables) → toujours 0. */
export function scaleLinear(domainMax: number, rangeMax: number): (v: number) => number {
  if (domainMax <= 0) return () => 0
  return (v: number) => (v / domainMax) * rangeMax
}

/**
 * Construit le path SVG d'une ligne (`line`) et de l'aire fermée sous cette ligne (`area`)
 * pour une série de valeurs, sur une largeur/hauteur données. Baseline en bas (y=h).
 * Retourne des chaînes vides pour <2 points (rien à tracer).
 */
export function buildAreaPath(values: number[], w: number, h: number): { line: string; area: string } {
  if (values.length < 2) return { line: '', area: '' }

  const max = Math.max(...values, 0)
  const y = scaleLinear(max, h)
  const n = values.length
  const x = (i: number) => (i / (n - 1)) * w

  const points = values.map((v, i) => `${x(i)},${h - y(v)}`)
  const line = `M${points.join(' L')}`
  const area = `${line} L${x(n - 1)},${h} L${x(0)},${h} Z`

  return { line, area }
}

/**
 * Sélectionne un sous-ensemble d'items à afficher comme ticks (labels d'axe), en incluant
 * toujours le premier et le dernier, sans jamais dépasser maxTicks. Fonctionne sur liste vide
 * (→ []) et à 1 élément (→ [premier]).
 */
export function sparseTicks<T>(items: T[], maxTicks: number): { item: T; index: number }[] {
  const n = items.length
  if (n === 0) return []
  if (n === 1 || maxTicks <= 1) return [{ item: items[0], index: 0 }]

  const count = Math.min(maxTicks, n)
  const step = (n - 1) / (count - 1)
  const indices = new Set<number>()
  for (let i = 0; i < count; i++) {
    indices.add(Math.round(i * step))
  }
  indices.add(n - 1)

  return Array.from(indices)
    .sort((a, b) => a - b)
    .map((index) => ({ item: items[index], index }))
}
