const TIMEZONE = 'Africa/Libreville'

function localDateKey(iso: string): string {
  // yyyy-mm-dd — clé de tri/comparaison stable (évite les collisions JJ/MM entre années).
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

function localDateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit' })
}

function localHour(iso: string): number {
  const s = new Date(iso).toLocaleTimeString('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', hour12: false })
  return parseInt(s, 10) % 24
}

export interface DayPoint {
  label: string
  ca: number
  count: number
}

/**
 * Série journalière (CA + nb commandes) sur une fenêtre continue de `days` jours se terminant
 * à `now` (incluse), du plus ancien au plus récent. Les jours sans commande apparaissent avec
 * ca=0/count=0. Les commandes annulées sont exclues. TZ Africa/Libreville, comme lib/home.ts.
 */
export function dailySeries(
  orders: { status: string; total: number; created_at: string }[],
  days: number,
  now: Date,
): DayPoint[] {
  const buckets = new Map<string, DayPoint>()
  const orderedKeys: string[] = []

  for (let i = days - 1; i >= 0; i--) {
    const iso = new Date(now.getTime() - i * 86_400_000).toISOString()
    const key = localDateKey(iso)
    orderedKeys.push(key)
    buckets.set(key, { label: localDateLabel(iso), ca: 0, count: 0 })
  }

  for (const o of orders) {
    if (o.status === 'annulee') continue
    const bucket = buckets.get(localDateKey(o.created_at))
    if (!bucket) continue
    bucket.ca += o.total
    bucket.count += 1
  }

  return orderedKeys.map((key) => buckets.get(key) as DayPoint)
}

/**
 * Agrège les lignes d'articles vendus par nom (qty sommée, ca = Σ qty*unit_price),
 * triées par qty décroissante, limitées à `limit`.
 */
export function topItems(
  items: { name: string; qty: number; unit_price: number }[],
  limit: number,
): { name: string; qty: number; ca: number }[] {
  const byName = new Map<string, { name: string; qty: number; ca: number }>()

  for (const it of items) {
    const entry = byName.get(it.name) ?? { name: it.name, qty: 0, ca: 0 }
    entry.qty += it.qty
    entry.ca += it.qty * it.unit_price
    byName.set(it.name, entry)
  }

  return Array.from(byName.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit)
}

const MODE_ORDER: { mode: string; label: string }[] = [
  { mode: 'sur_place', label: 'Sur place' },
  { mode: 'drive', label: 'Drive' },
  { mode: 'livraison', label: 'Livraison' },
]

/** Répartition des commandes (hors annulées) par mode, ordre fixe incluant les modes à 0. */
export function modeSplit(
  orders: { status: string; mode: string }[],
): { mode: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const o of orders) {
    if (o.status === 'annulee') continue
    counts.set(o.mode, (counts.get(o.mode) ?? 0) + 1)
  }
  return MODE_ORDER.map(({ mode, label }) => ({ mode, label, count: counts.get(mode) ?? 0 }))
}

/** Histogramme des commandes (hors annulées) par heure locale Libreville, 24 seaux (0-23). */
export function hourHistogram(
  orders: { status: string; created_at: string }[],
): { hour: number; count: number }[] {
  const counts = new Array(24).fill(0) as number[]
  for (const o of orders) {
    if (o.status === 'annulee') continue
    counts[localHour(o.created_at)] += 1
  }
  return counts.map((count, hour) => ({ hour, count }))
}

const PLAN_ORDER = ['starter', 'pro', 'premium'] as const

/** Répartition des restaurants par plan, ordre fixe (starter, pro, premium) incluant les 0. */
export function planSplit(rows: { plan: string }[]): { plan: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const r of rows) {
    counts.set(r.plan, (counts.get(r.plan) ?? 0) + 1)
  }
  return PLAN_ORDER.map((plan) => ({ plan, count: counts.get(plan) ?? 0 }))
}
