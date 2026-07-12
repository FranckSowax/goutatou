/**
 * Parse une saisie « lat, lng » copiée depuis Google Maps (clic droit → copier
 * les coordonnées, ex. « 0.3901, 9.4544 »). Le séparateur décimal est TOUJOURS
 * le point (format Google) — la virgule ne sert que de séparateur entre lat et
 * lng, jamais de séparateur décimal.
 *
 * Retourne null si la saisie est vide, mal formée, ou hors bornes
 * (lat ∈ [-90, 90], lng ∈ [-180, 180]).
 */
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  const match = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(trimmed)
  if (!match) return null

  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < -90 || lat > 90) return null
  if (lng < -180 || lng > 180) return null

  return { lat, lng }
}
