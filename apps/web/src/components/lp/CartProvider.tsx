'use client'
import { createContext, useContext, type ReactNode } from 'react'
type CartApi = { addItem: (i: { menuItemId: string; name: string; unitPrice: number }) => void }
const Ctx = createContext<CartApi>({ addItem: () => {} })
export const useCart = () => useContext(Ctx)
export function CartProvider({ children }: { children: ReactNode; slug: string }) {
  return <Ctx.Provider value={{ addItem: () => {} }}>{children}</Ctx.Provider>
}
