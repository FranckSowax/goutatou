export interface CartSupplement {
  id: string
  name: string
  price: number
}

export interface WebCartItem {
  menuItemId: string
  name: string
  unitPrice: number
  qty: number
  supplements: CartSupplement[]
}

export type CartAction =
  | { type: 'add'; item: Omit<WebCartItem, 'qty'> }
  | { type: 'remove'; lineKey: string }
  | { type: 'setQty'; lineKey: string; qty: number }
  | { type: 'clear' }

const MAX_QTY = 20

/** Identité d'une ligne panier : un même plat avec des suppléments différents forme des lignes distinctes. */
export function lineKey(item: { menuItemId: string; supplements: { id: string }[] }): string {
  const ids = item.supplements.map((s) => s.id).slice().sort()
  return `${item.menuItemId}::${ids.join(',')}`
}

/** Prix unitaire d'une ligne, suppléments inclus (affichage client — le serveur reprice toujours). */
export function cartLineUnitPrice(item: Pick<WebCartItem, 'unitPrice' | 'supplements'>): number {
  return item.unitPrice + item.supplements.reduce((sum, s) => sum + s.price, 0)
}

export function cartReducer(items: WebCartItem[], action: CartAction): WebCartItem[] {
  switch (action.type) {
    case 'add': {
      const key = lineKey(action.item)
      const existing = items.find((i) => lineKey(i) === key)
      if (existing) {
        return items.map((i) =>
          lineKey(i) === key ? { ...i, qty: Math.min(i.qty + 1, MAX_QTY) } : i)
      }
      return [...items, { ...action.item, qty: 1 }]
    }
    case 'remove':
      return items.filter((i) => lineKey(i) !== action.lineKey)
    case 'setQty': {
      if (action.qty <= 0) return items.filter((i) => lineKey(i) !== action.lineKey)
      return items.map((i) =>
        lineKey(i) === action.lineKey ? { ...i, qty: Math.min(action.qty, MAX_QTY) } : i)
    }
    case 'clear':
      return []
  }
}

export function webCartTotal(items: WebCartItem[]): number {
  return items.reduce((sum, i) => sum + cartLineUnitPrice(i) * i.qty, 0)
}

function isCartSupplement(v: unknown): v is CartSupplement {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.price === 'number'
}

/**
 * Normalise un panier lu depuis localStorage : les anciennes entrées (avant
 * l'ajout des suppléments) n'ont pas le champ `supplements` → défaut [].
 * Ne doit jamais lever : toute entrée malformée est ignorée silencieusement.
 */
export function normalizeCartItems(raw: unknown): WebCartItem[] {
  if (!Array.isArray(raw)) return []
  const out: WebCartItem[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const o = entry as Record<string, unknown>
    if (typeof o.menuItemId !== 'string' || typeof o.name !== 'string') continue
    if (typeof o.unitPrice !== 'number' || typeof o.qty !== 'number') continue
    const supplements = Array.isArray(o.supplements) ? o.supplements.filter(isCartSupplement) : []
    out.push({ menuItemId: o.menuItemId, name: o.name, unitPrice: o.unitPrice, qty: o.qty, supplements })
  }
  return out
}
