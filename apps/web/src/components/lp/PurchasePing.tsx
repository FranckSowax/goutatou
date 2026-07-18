'use client'
import { useEffect, useRef } from 'react'
import { track } from '@/lib/lp/pixel'

/**
 * Émet un Purchase unique au montage de /r/[slug]/merci avec la VRAIE valeur de la commande
 * (montant réel calculé côté serveur, transmis dans la query `t`). Aucune valeur bidon.
 */
export function PurchasePing({ value }: { value: number }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    if (!Number.isFinite(value) || value <= 0) return
    track('Purchase', { currency: 'XAF', value })
  }, [value])
  return null
}
