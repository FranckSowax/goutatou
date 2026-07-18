// Bornes UTC des périodes d'analyse (jour / semaine / mois) au fuseau Libreville (UTC+1),
// pour la page /app/analyses. On réutilise les briques de `order-day.ts` (jour civil Libreville
// + décalage fixe) ; pas de bibliothèque de fuseaux nécessaire. Module PUR (testé).
import { dayBoundsUtc, formatYmdLibreville, shiftDay } from './order-day'

export type AnalysisPeriod = 'day' | 'week' | 'month'

/** Bornes UTC `[startUtc, endUtc)` d'une fenêtre. */
export interface Bounds {
  startUtc: string
  endUtc: string
}

export interface PeriodBounds {
  /** Fenêtre de la période courante (en cours). */
  current: Bounds
  /** Fenêtre de la période précédente, immédiatement antérieure (pour les Δ%). */
  previous: Bounds
  /** 1er jour civil (Libreville) de la période courante, `YYYY-MM-DD`. */
  startYmd: string
  /** Dernier jour civil (Libreville) de la période courante, `YYYY-MM-DD`. */
  endYmd: string
}

/** Index du jour de semaine (0=lundi … 6=dimanche) d'un jour civil `YYYY-MM-DD`. */
function weekdayMonIndex(ymd: string): number {
  const day = new Date(`${ymd}T00:00:00Z`).getUTCDay() // 0=dimanche … 6=samedi
  return (day + 6) % 7 // 0=lundi … 6=dimanche
}

/** Décale un couple (année, mois 1-12) de `delta` mois. */
function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const idx = year * 12 + (month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

function firstOfMonthYmd(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-01`
}

/**
 * Calcule les bornes UTC de la période courante et de la période précédente à partir de
 * l'instant `now`, au fuseau Libreville :
 * - `day`   = jour civil en cours ; précédent = la veille.
 * - `week`  = semaine ISO en cours (lundi→dimanche) ; précédent = semaine d'avant.
 * - `month` = mois civil en cours ; précédent = mois d'avant.
 */
export function periodBounds(period: AnalysisPeriod, now: Date): PeriodBounds {
  const todayYmd = formatYmdLibreville(now)

  if (period === 'day') {
    const current = dayBoundsUtc(todayYmd)
    const prevYmd = shiftDay(todayYmd, -1)
    return {
      current,
      previous: dayBoundsUtc(prevYmd),
      startYmd: todayYmd,
      endYmd: todayYmd,
    }
  }

  if (period === 'week') {
    const monday = shiftDay(todayYmd, -weekdayMonIndex(todayYmd))
    const nextMonday = shiftDay(monday, 7)
    const prevMonday = shiftDay(monday, -7)
    const currentStart = dayBoundsUtc(monday).startUtc
    const currentEnd = dayBoundsUtc(nextMonday).startUtc
    return {
      current: { startUtc: currentStart, endUtc: currentEnd },
      previous: { startUtc: dayBoundsUtc(prevMonday).startUtc, endUtc: currentStart },
      startYmd: monday,
      endYmd: shiftDay(monday, 6),
    }
  }

  // month
  const [yStr, mStr] = todayYmd.split('-')
  const year = Number(yStr)
  const month = Number(mStr)
  const firstThis = firstOfMonthYmd(year, month)
  const next = shiftMonth(year, month, 1)
  const prev = shiftMonth(year, month, -1)
  const firstNext = firstOfMonthYmd(next.year, next.month)
  const firstPrev = firstOfMonthYmd(prev.year, prev.month)
  const currentStart = dayBoundsUtc(firstThis).startUtc
  const currentEnd = dayBoundsUtc(firstNext).startUtc
  return {
    current: { startUtc: currentStart, endUtc: currentEnd },
    previous: { startUtc: dayBoundsUtc(firstPrev).startUtc, endUtc: currentStart },
    startYmd: firstThis,
    endYmd: shiftDay(firstNext, -1),
  }
}
