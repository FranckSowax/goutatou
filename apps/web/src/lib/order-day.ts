// Navigation par jour civil pour la page Commandes. Fuseau Libreville (UTC+1, sans changement
// d'heure) → un décalage fixe suffit, pas besoin de bibliothèque de fuseaux.
const TZ_OFFSET = '+01:00'

/** Formate une date en `YYYY-MM-DD` selon le jour civil de Libreville. */
export function formatYmdLibreville(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Libreville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Vrai si `s` est un jour civil valide `YYYY-MM-DD`. */
export function isValidYmd(s: string | undefined | null): s is string {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  return !Number.isNaN(new Date(`${s}T12:00:00${TZ_OFFSET}`).getTime())
}

/** Bornes UTC `[startUtc, endUtc)` du jour civil `dateStr` à Libreville, pour filtrer `created_at`. */
export function dayBoundsUtc(dateStr: string): { startUtc: string; endUtc: string } {
  const start = new Date(`${dateStr}T00:00:00${TZ_OFFSET}`)
  const end = new Date(start.getTime() + 24 * 3600 * 1000)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

/** Décale le jour civil `dateStr` de `delta` jours (négatif = passé), renvoie `YYYY-MM-DD`. */
export function shiftDay(dateStr: string, delta: number): string {
  const noon = new Date(`${dateStr}T12:00:00${TZ_OFFSET}`)
  return formatYmdLibreville(new Date(noon.getTime() + delta * 24 * 3600 * 1000))
}

/** Libellé FR lisible d'un jour civil, ex. « jeudi 17 juillet ». */
export function formatDayLabel(dateStr: string): string {
  const noon = new Date(`${dateStr}T12:00:00${TZ_OFFSET}`)
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Africa/Libreville',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(noon)
}
