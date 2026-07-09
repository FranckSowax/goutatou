'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { formatFcfa } from '@goutatou/db/types'
import { useCart } from './CartProvider'

export function CartBar() {
  const { count, total, slug } = useCart()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || count === 0) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3">
      <Link href={`/r/${slug}/commander`}
        className="mx-auto flex max-w-md items-center justify-between rounded-full px-6 py-3 font-semibold text-white shadow-2xl"
        style={{ backgroundColor: 'var(--lp-primary)' }}>
        <span>🛒 {count} plat{count > 1 ? 's' : ''} · {formatFcfa(total)}</span>
        <span>Commander →</span>
      </Link>
    </div>
  )
}
