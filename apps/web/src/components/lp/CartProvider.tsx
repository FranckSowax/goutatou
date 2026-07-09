'use client'
import type { ReactNode } from 'react'
export function CartProvider({ children }: { children: ReactNode; slug: string }) {
  return <>{children}</>
}
