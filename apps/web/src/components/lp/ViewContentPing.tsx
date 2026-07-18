'use client'
import { useEffect, useRef } from 'react'
import { track } from '@/lib/lp/pixel'
import { toCatalogId } from '@/lib/lp/order-url'

/** Émet un ViewContent unique au montage de la carte /r/[slug] (garde useRef contre le double-effet React). */
export function ViewContentPing({ ids }: { ids: string[] }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    track('ViewContent', {
      content_type: 'product',
      content_ids: ids.map(toCatalogId),
      currency: 'XAF',
    })
  }, [ids])
  return null
}
