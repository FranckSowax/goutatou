function clamp(index: number, length: number): number {
  if (length <= 0) return 0
  return Math.min(Math.max(index, 0), length - 1)
}

export function arrayMove<T>(arr: T[], from: number, to: number): T[] {
  const result = arr.slice()
  if (result.length === 0) return result
  const clampedFrom = clamp(from, result.length)
  const clampedTo = clamp(to, result.length)
  const [moved] = result.splice(clampedFrom, 1)
  result.splice(clampedTo, 0, moved)
  return result
}

export function positionUpdates(orderedIds: string[]): { id: string; position: number }[] {
  return orderedIds.map((id, position) => ({ id, position }))
}
