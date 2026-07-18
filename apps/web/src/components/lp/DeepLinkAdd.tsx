'use client'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useCart } from './CartProvider'
import { parseAddParam } from '@/lib/lp/deep-link'
import { track } from '@/lib/lp/pixel'
import { toCatalogId } from '@/lib/lp/order-url'

/** Plat du catalogue nécessaire pour résoudre un ajout via `?add=` (données seulement, pas de fonction). */
export interface DeepLinkItem {
  id: string
  name: string
  price: number
}

/**
 * Deep-link « panier pré-rempli » : au montage, lit `?add=<id[,id2]>`, ne garde que les ids CONNUS,
 * ajoute chaque plat au panier (+ AddToCart pixel), nettoie l'URL (idempotence : un reload ne
 * ré-ajoute pas, panier persistant) et scrolle vers le panier. Monté sous <CartProvider>.
 */
export function DeepLinkAdd({ items }: { items: DeepLinkItem[] }) {
  const { addItem } = useCart()
  const searchParams = useSearchParams()
  const done = useRef(false)

  useEffect(() => {
    // Garde contre le double-effet React (StrictMode) : un seul traitement du deep-link.
    if (done.current) return
    done.current = true

    const raw = searchParams.get('add')
    const byId = new Map(items.map((i) => [i.id, i]))
    const ids = parseAddParam(raw, new Set(byId.keys()))
    if (ids.length === 0) return

    for (const id of ids) {
      const item = byId.get(id)
      if (!item) continue
      addItem({ menuItemId: item.id, name: item.name, unitPrice: item.price, supplements: [] })
      track('AddToCart', {
        content_type: 'product',
        content_ids: [toCatalogId(id)],
        currency: 'XAF',
        value: item.price,
      })
    }

    // Idempotence : retire `?add` (et le reste de la query) pour qu'un rechargement ne ré-ajoute pas.
    window.history.replaceState({}, '', window.location.pathname)

    // Ramène l'utilisateur vers le panier (respecte prefers-reduced-motion, pas de piège de focus).
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document
      .getElementById('cart-anchor')
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'end' })
  }, [searchParams, items, addItem])

  return null
}
