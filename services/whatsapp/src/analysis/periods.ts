import type { Period } from './types.js'

// Fuseau Libreville (UTC+1, sans changement d'heure) → décalage fixe suffisant.
const TZ_OFFSET = '+01:00'

/** Jour civil Libreville d'un instant, format YYYY-MM-DD. */
export function ymdLibreville(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Libreville',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

/** Décale un jour civil de `n` jours, renvoie YYYY-MM-DD. */
export function addDays(dateStr: string, n: number): string {
  const noon = new Date(`${dateStr}T12:00:00${TZ_OFFSET}`)
  return ymdLibreville(new Date(noon.getTime() + n * 86_400_000))
}

/** Jour de semaine 0=lundi … 6=dimanche pour un jour civil. */
export function weekdayMon0(dateStr: string): number {
  const day = new Date(`${dateStr}T12:00:00${TZ_OFFSET}`).getUTCDay() // 0=dimanche
  return (day + 6) % 7
}

/** Bornes UTC `[startUtc, endUtc)` couvrant les jours civils Libreville de `start` à `end` inclus. */
export function periodBoundsUtc(start: string, end: string): { startUtc: string; endUtc: string } {
  const s = new Date(`${start}T00:00:00${TZ_OFFSET}`)
  const e = new Date(`${end}T00:00:00${TZ_OFFSET}`).getTime() + 86_400_000
  return { startUtc: s.toISOString(), endUtc: new Date(e).toISOString() }
}

/**
 * Les 3 dernières périodes COMPLÈTES à `now` (Libreville) : la veille (day), la semaine ISO
 * précédente lun→dim (week), le mois précédent (month). Le worker les génère si elles n'existent
 * pas encore (idempotence via `reportExists`) — ce qui backfille naturellement une exécution
 * manquée, sans dépendre du jour/heure exact du passage.
 */
export function duePeriods(now: Date): Period[] {
  const today = ymdLibreville(now)

  // Veille
  const yesterday = addDays(today, -1)

  // Semaine ISO précédente
  const thisMonday = addDays(today, -weekdayMon0(today))
  const prevMonday = addDays(thisMonday, -7)
  const prevSunday = addDays(thisMonday, -1)

  // Mois précédent
  const firstThisMonth = `${today.slice(0, 8)}01`
  const prevMonthEnd = addDays(firstThisMonth, -1)
  const prevMonthStart = `${prevMonthEnd.slice(0, 8)}01`

  return [
    { type: 'day', start: yesterday, end: yesterday },
    { type: 'week', start: prevMonday, end: prevSunday },
    { type: 'month', start: prevMonthStart, end: prevMonthEnd },
  ]
}

const PERIOD_LABELS: Record<Period['type'], string> = {
  day: 'la journée',
  week: 'la semaine',
  month: 'le mois',
}

export function periodLabel(p: Period): string {
  return `${PERIOD_LABELS[p.type]} du ${p.start}${p.end !== p.start ? ` au ${p.end}` : ''}`
}
