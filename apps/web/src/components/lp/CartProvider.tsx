'use client'
import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import { cartReducer, normalizeCartItems, webCartTotal, type CartAction, type WebCartItem } from '@/lib/lp/cart'

interface CartApi {
  items: WebCartItem[]
  addItem: (i: Omit<WebCartItem, 'qty'>) => void
  removeItem: (lineKey: string) => void
  setQty: (lineKey: string, qty: number) => void
  clear: () => void
  total: number
  count: number
  slug: string
}

const Ctx = createContext<CartApi | null>(null)

export function useCart(): CartApi {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCart doit être utilisé sous <CartProvider>')
  return ctx
}

export function CartProvider({ children, slug }: { children: ReactNode; slug: string }) {
  const key = `goutatou-cart-${slug}`
  const [items, dispatch] = useReducer(
    (s: WebCartItem[], a: CartAction) => cartReducer(s, a),
    [],
    () => {
      if (typeof window === 'undefined') return []
      try { return normalizeCartItems(JSON.parse(window.localStorage.getItem(key) ?? '[]')) } catch { return [] }
    },
  )
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(items)) } catch { /* stockage plein/privé */ }
  }, [items, key])

  return (
    <Ctx.Provider value={{
      items,
      addItem: (item) => dispatch({ type: 'add', item }),
      removeItem: (lineKey) => dispatch({ type: 'remove', lineKey }),
      setQty: (lineKey, qty) => dispatch({ type: 'setQty', lineKey, qty }),
      clear: () => dispatch({ type: 'clear' }),
      total: webCartTotal(items),
      count: items.reduce((n, i) => n + i.qty, 0),
      slug,
    }}>
      {children}
    </Ctx.Provider>
  )
}
