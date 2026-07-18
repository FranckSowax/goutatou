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
 * Bornes UTC de la DERNIÈRE période COMPLÈTE (révolue) et de celle d'avant, au fuseau Libreville.
 * On s'aligne exactement sur ce que génère le worker bot (`analysis/periods.ts` `duePeriods`) pour
 * que les KPIs affichés et le rapport IA portent sur la MÊME fenêtre :
 * - `day`   = la veille ; précédent = l'avant-veille.
 * - `week`  = la semaine ISO précédente (lundi→dimanche) ; précédent = celle d'avant.
 * - `month` = le mois précédent ; précédent = celui d'avant.
 * `startYmd`/`endYmd` = jours civils (Libreville) de la période complète — servent à retrouver le
 * rapport IA exact (`analysis_reports.period_start = startYmd`).
 */
export function periodBounds(period: AnalysisPeriod, now: Date): PeriodBounds {
  const todayYmd = formatYmdLibreville(now)

  if (period === 'day') {
    const yesterday = shiftDay(todayYmd, -1)
    return {
      current: dayBoundsUtc(yesterday),
      previous: dayBoundsUtc(shiftDay(todayYmd, -2)),
      startYmd: yesterday,
      endYmd: yesterday,
    }
  }

  if (period === 'week') {
    const thisMonday = shiftDay(todayYmd, -weekdayMonIndex(todayYmd))
    const prevMonday = shiftDay(thisMonday, -7) // début de la semaine complète précédente
    const prevPrevMonday = shiftDay(thisMonday, -14)
    return {
      current: { startUtc: dayBoundsUtc(prevMonday).startUtc, endUtc: dayBoundsUtc(thisMonday).startUtc },
      previous: { startUtc: dayBoundsUtc(prevPrevMonday).startUtc, endUtc: dayBoundsUtc(prevMonday).startUtc },
      startYmd: prevMonday,
      endYmd: shiftDay(prevMonday, 6),
    }
  }

  // month : le mois précédent complet
  const [yStr, mStr] = todayYmd.split('-')
  const year = Number(yStr)
  const month = Number(mStr)
  const firstThis = firstOfMonthYmd(year, month)
  const prev = shiftMonth(year, month, -1)
  const prevPrev = shiftMonth(year, month, -2)
  const firstPrev = firstOfMonthYmd(prev.year, prev.month)
  const firstPrevPrev = firstOfMonthYmd(prevPrev.year, prevPrev.month)
  return {
    current: { startUtc: dayBoundsUtc(firstPrev).startUtc, endUtc: dayBoundsUtc(firstThis).startUtc },
    previous: { startUtc: dayBoundsUtc(firstPrevPrev).startUtc, endUtc: dayBoundsUtc(firstPrev).startUtc },
    startYmd: firstPrev,
    endYmd: shiftDay(firstThis, -1),
  }
}
