'use client'
import { useEffect, useRef } from 'react'
import { track } from '@/lib/lp/pixel'

/**
 * Émet un Purchase UNIQUE avec la VRAIE valeur de la commande (montant réel calculé côté serveur,
 * transmis dans la query `t`). Dédup inter-chargement : un reload / retour arrière sur la page merci
 * ne doit pas ré-émettre l'achat → on marque le n° de commande en `sessionStorage` et on passe un
 * `eventID` stable pour que Meta déduplique aussi de son côté.
 */
export function PurchasePing({ value, orderKey }: { value: number; orderKey: string | null }) {
  const fired = useRef(false)
  useEffect(() => {
    if (fired.current) return
    fired.current = true
    if (!Number.isFinite(value) || value <= 0) return

    const storageKey = orderKey ? `goutatou.purchase.${orderKey}` : null
    try {
      if (storageKey && window.sessionStorage.getItem(storageKey)) return // déjà émis (reload/retour)
      if (storageKey) window.sessionStorage.setItem(storageKey, '1')
    } catch {
      /* stockage indispo : on émet une fois par montage, l'eventID couvre la dédup Meta */
    }

    track('Purchase', { currency: 'XAF', value }, orderKey ? { eventID: `purchase-${orderKey}` } : undefined)
  }, [value, orderKey])
  return null
}
