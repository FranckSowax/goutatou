export interface WebCartItem {
  menuItemId: string
  name: string
  unitPrice: number
  qty: number
}

export type CartAction =
  | { type: 'add'; item: Omit<WebCartItem, 'qty'> }
  | { type: 'remove'; menuItemId: string }
  | { type: 'setQty'; menuItemId: string; qty: number }
  | { type: 'clear' }

const MAX_QTY = 20

export function cartReducer(items: WebCartItem[], action: CartAction): WebCartItem[] {
  switch (action.type) {
    case 'add': {
      const existing = items.find((i) => i.menuItemId === action.item.menuItemId)
      if (existing) {
        return items.map((i) =>
          i.menuItemId === action.item.menuItemId ? { ...i, qty: Math.min(i.qty + 1, MAX_QTY) } : i)
      }
      return [...items, { ...action.item, qty: 1 }]
    }
    case 'remove':
      return items.filter((i) => i.menuItemId !== action.menuItemId)
    case 'setQty': {
      if (action.qty <= 0) return items.filter((i) => i.menuItemId !== action.menuItemId)
      return items.map((i) =>
        i.menuItemId === action.menuItemId ? { ...i, qty: Math.min(action.qty, MAX_QTY) } : i)
    }
    case 'clear':
      return []
  }
}

export function webCartTotal(items: WebCartItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.qty, 0)
}
