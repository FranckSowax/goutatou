/**
 * Modèle panier pur pour la caisse Sur Place (POS). Pas d'effet de bord — la persistance/le
 * rendu sont gérés par `pos.tsx` (POS4). Cf. plan docs/superpowers/plans/2026-07-13-pos-comptoir.md,
 * Task POS1.
 */

export interface PosLine {
  key: string
  menuItemId: string
  name: string
  unitPrice: number
  qty: number
  supplements: { id: string; name: string; price: number }[]
}

export interface PosCart {
  lines: PosLine[]
}

/** Clé déterministe : menuItemId + ids de suppléments triés (ordre indifférent). */
function lineKey(menuItemId: string, supplements: { id: string }[]): string {
  const ids = supplements.map((s) => s.id).slice().sort()
  return `${menuItemId}::${ids.join(',')}`
}

/**
 * Ajoute un plat au panier. Même plat + mêmes suppléments (ordre indifférent) → fusionne sur la
 * ligne existante (qty+1). Suppléments différents → nouvelle ligne.
 */
export function addLine(
  cart: PosCart,
  item: { menuItemId: string; name: string; unitPrice: number },
  supplements: { id: string; name: string; price: number }[],
): PosCart {
  const key = lineKey(item.menuItemId, supplements)
  const existing = cart.lines.find((l) => l.key === key)
  if (existing) {
    return { lines: cart.lines.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l)) }
  }
  const line: PosLine = { key, menuItemId: item.menuItemId, name: item.name, unitPrice: item.unitPrice, qty: 1, supplements }
  return { lines: [...cart.lines, line] }
}

/** Ajuste la quantité d'une ligne ; qty<=0 retire la ligne. */
export function setQty(cart: PosCart, key: string, qty: number): PosCart {
  if (qty <= 0) return removeLine(cart, key)
  return { lines: cart.lines.map((l) => (l.key === key ? { ...l, qty } : l)) }
}

export function removeLine(cart: PosCart, key: string): PosCart {
  return { lines: cart.lines.filter((l) => l.key !== key) }
}

/** Σ qty*(unitPrice + Σ prix suppléments). */
export function cartTotal(cart: PosCart): number {
  return cart.lines.reduce((sum, l) => {
    const lineUnitPrice = l.unitPrice + l.supplements.reduce((s, sup) => s + sup.price, 0)
    return sum + lineUnitPrice * l.qty
  }, 0)
}

/** Forme attendue par `create_order` (`p_items`) — omet `supplement_ids` si vide. */
export function toCreateOrderItems(
  cart: PosCart,
): { menu_item_id: string; qty: number; supplement_ids?: string[] }[] {
  return cart.lines.map((l) => {
    const base = { menu_item_id: l.menuItemId, qty: l.qty }
    if (l.supplements.length === 0) return base
    return { ...base, supplement_ids: l.supplements.map((s) => s.id) }
  })
}
