export function targetRotationDeg(index: number, count: number, turns = 5): number {
  if (count <= 0) return turns * 360
  const sector = 360 / count
  // Ramener le centre du secteur `index` en haut (0°) : rotation = tours - index*sector
  const align = (360 - index * sector) % 360
  return turns * 360 + align
}
