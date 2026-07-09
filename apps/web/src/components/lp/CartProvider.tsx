'use client'
import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react'
import { cartReducer, webCartTotal, type CartAction, type WebCartItem } from '@/lib/lp/cart'

interface CartApi {
  items: WebCartItem[]
  addItem: (i: Omit<WebCartItem, 'qty'>) => void
  removeItem: (id: string) => void
  setQty: (id: string, qty: number) => void
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
      try { return JSON.parse(window.localStorage.getItem(key) ?? '[]') as WebCartItem[] } catch { return [] }
    },
  )
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(items)) } catch { /* stockage plein/privé */ }
  }, [items, key])

  return (
    <Ctx.Provider value={{
      items,
      addItem: (item) => dispatch({ type: 'add', item }),
      removeItem: (menuItemId) => dispatch({ type: 'remove', menuItemId }),
      setQty: (menuItemId, qty) => dispatch({ type: 'setQty', menuItemId, qty }),
      clear: () => dispatch({ type: 'clear' }),
      total: webCartTotal(items),
      count: items.reduce((n, i) => n + i.qty, 0),
      slug,
    }}>
      {children}
    </Ctx.Provider>
  )
}
