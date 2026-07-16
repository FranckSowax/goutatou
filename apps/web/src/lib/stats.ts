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

/** Index du jour de semaine local (0=Lundi … 6=Dimanche), basé sur la date calendaire Libreville. */
function localWeekdayIndex(iso: string): number {
  const day = new Date(`${localDateKey(iso)}T00:00:00Z`).getUTCDay() // 0=dimanche … 6=samedi
  return (day + 6) % 7 // 0=lundi … 6=dimanche
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
  { mode: 'sur_place', label: 'À emporter' },
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

/**
 * Variation en % entre deux valeurs, arrondie. `null` si `previous` vaut 0 (pas de base de
 * comparaison possible, éviter une division par 0 / un "infini" trompeur).
 */
export function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

/**
 * CA cumulé par jour de semaine (Lun→Dim, ordre fixe) sur une fenêtre continue de `days` jours
 * se terminant à `now` (incluse). Les jours de semaine sans CA apparaissent à 0. Les commandes
 * annulées sont exclues, et les commandes hors fenêtre sont ignorées. TZ Africa/Libreville.
 */
export function weekdayCa(
  orders: { status: string; total: number; created_at: string }[],
  now: Date,
  days: number,
): { label: string; ca: number }[] {
  const validKeys = new Set<string>()
  for (let i = days - 1; i >= 0; i--) {
    const iso = new Date(now.getTime() - i * 86_400_000).toISOString()
    validKeys.add(localDateKey(iso))
  }

  const totals = new Array(7).fill(0) as number[]
  for (const o of orders) {
    if (o.status === 'annulee') continue
    if (!validKeys.has(localDateKey(o.created_at))) continue
    totals[localWeekdayIndex(o.created_at)] += o.total
  }

  return WEEKDAY_LABELS.map((label, i) => ({ label, ca: totals[i] }))
}

/**
 * Parmi les clients distincts ayant commandé (hors annulées), distingue nouveaux (client créé
 * dans la fenêtre, `created_at >= sinceIso`) et récurrents (client créé avant la fenêtre).
 */
export function newVsReturning(
  orders: { customer_id: string; status: string }[],
  customers: { id: string; created_at: string }[],
  sinceIso: string,
): { nouveaux: number; recurrents: number } {
  const customerIds = new Set<string>()
  for (const o of orders) {
    if (o.status === 'annulee') continue
    customerIds.add(o.customer_id)
  }

  const createdAtById = new Map(customers.map((c) => [c.id, c.created_at]))

  let nouveaux = 0
  let recurrents = 0
  for (const id of customerIds) {
    const createdAt = createdAtById.get(id)
    if (createdAt === undefined) continue
    if (createdAt >= sinceIso) nouveaux += 1
    else recurrents += 1
  }

  return { nouveaux, recurrents }
}

const SOURCE_ORDER: { source: string; label: string }[] = [
  { source: 'whatsapp', label: 'WhatsApp' },
  { source: 'web', label: 'Site web' },
  { source: 'comptoir', label: 'Comptoir' },
]

/** Répartition des commandes (hors annulées) par source, ordre fixe incluant les 0. */
export function sourceSplit(
  orders: { status: string; source: string }[],
): { source: string; label: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const o of orders) {
    if (o.status === 'annulee') continue
    counts.set(o.source, (counts.get(o.source) ?? 0) + 1)
  }
  return SOURCE_ORDER.map(({ source, label }) => ({ source, label, count: counts.get(source) ?? 0 }))
}

/** % de commandes annulées sur le total (annulées incluses), arrondi ; 0 si aucune commande. */
export function cancelRate(orders: { status: string }[]): number {
  if (orders.length === 0) return 0
  const cancelled = orders.filter((o) => o.status === 'annulee').length
  return Math.round((cancelled / orders.length) * 100)
}
