// CRM — agrégation des clients à partir de `customers` + `orders`. Purs et testables.

export interface RawCustomer {
  id: string
  name: string | null
  phone: string
  marketing_opt_in: boolean
  opted_out: boolean
  created_at: string
  notes: string | null
}

export interface RawOrder {
  customer_id: string
  total: number
  status: string
  created_at: string
  items: { name: string; qty: number }[]
}

export interface ClientRow {
  id: string
  name: string | null
  phone: string
  ordersCount: number
  ltv: number
  lastOrderAt: string | null
  avgBasket: number
  favoriteItem: string | null
  marketingOptIn: boolean
  optedOut: boolean
  createdAt: string
  notes: string | null
}

export type Segment = 'fidele' | 'inactif' | 'nouveau' | 'desabonne' | 'actif'

/** Seuils (constants documentés) : fidèle ≥ 3 commandes ; inactif > 30 j sans commande ; nouveau < 30 j. */
export const FIDELE_MIN_ORDERS = 3
export const INACTIF_DAYS = 30
export const NOUVEAU_DAYS = 30

const SUPPLEMENT_PREFIX = '↳'

/** Agrège les commandes (hors annulées) par client → lignes CRM triées par LTV décroissante. */
export function buildClients(customers: RawCustomer[], orders: RawOrder[]): ClientRow[] {
  const byCustomer = new Map<string, RawOrder[]>()
  for (const o of orders) {
    if (o.status === 'annulee') continue
    const list = byCustomer.get(o.customer_id) ?? []
    list.push(o)
    byCustomer.set(o.customer_id, list)
  }

  const rows: ClientRow[] = customers.map((c) => {
    const os = byCustomer.get(c.id) ?? []
    const ordersCount = os.length
    const ltv = os.reduce((s, o) => s + o.total, 0)
    const lastOrderAt = os.reduce<string | null>((max, o) => (max && max >= o.created_at ? max : o.created_at), null)

    // Plat préféré : article (hors lignes supplément ↳) le plus commandé en quantité.
    const qtyByName = new Map<string, number>()
    for (const o of os) {
      for (const it of o.items) {
        if (it.name.startsWith(SUPPLEMENT_PREFIX)) continue
        qtyByName.set(it.name, (qtyByName.get(it.name) ?? 0) + it.qty)
      }
    }
    let favoriteItem: string | null = null
    let bestQty = 0
    for (const [name, qty] of qtyByName) {
      if (qty > bestQty) {
        bestQty = qty
        favoriteItem = name
      }
    }

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      ordersCount,
      ltv,
      lastOrderAt,
      avgBasket: ordersCount > 0 ? Math.round(ltv / ordersCount) : 0,
      favoriteItem,
      marketingOptIn: c.marketing_opt_in,
      optedOut: c.opted_out,
      createdAt: c.created_at,
      notes: c.notes,
    }
  })

  return rows.sort((a, b) => b.ltv - a.ltv)
}

function daysSince(iso: string, now: Date): number {
  return (now.getTime() - new Date(iso).getTime()) / 86_400_000
}

/**
 * Segment d'un client (priorité : désabonné > fidèle > inactif > nouveau > actif). Un désabonné reste
 * signalé comme tel avant tout ; un client sans commande depuis > 30 j (ou n'ayant jamais commandé) est
 * inactif.
 */
export function segmentOf(c: ClientRow, now: Date): Segment {
  if (c.optedOut) return 'desabonne'
  if (c.ordersCount >= FIDELE_MIN_ORDERS) return 'fidele'
  if (!c.lastOrderAt || daysSince(c.lastOrderAt, now) > INACTIF_DAYS) return 'inactif'
  if (daysSince(c.createdAt, now) < NOUVEAU_DAYS) return 'nouveau'
  return 'actif'
}

export function filterBySegment(clients: ClientRow[], segment: Segment | 'tous', now: Date): ClientRow[] {
  if (segment === 'tous') return clients
  return clients.filter((c) => segmentOf(c, now) === segment)
}

export function searchClients(clients: ClientRow[], query: string): ClientRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return clients
  return clients.filter(
    (c) => (c.name ?? '').toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')),
  )
}
