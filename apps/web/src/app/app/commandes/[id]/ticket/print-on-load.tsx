'use client'
import { useEffect } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Déclenche l'impression au montage si `shouldPrint` (posé par `?print=1` — bouton 🖨️ du board
 * ou fin du flux Sur Place). Délai de 300ms pour laisser le navigateur peindre le ticket avant
 * d'ouvrir la boîte de dialogue d'impression. `shouldPrint` est un booléen : jamais de prop
 * fonction Server→Client.
 *
 * Affiche aussi un bouton « Imprimer » manuel — visible à l'écran (aperçu), masqué à l'impression
 * elle-même via `print:hidden` (il n'a pas sa place sur le papier).
 */
export function PrintOnLoad({ shouldPrint }: { shouldPrint: boolean }) {
  useEffect(() => {
    if (!shouldPrint) return
    const timer = setTimeout(() => window.print(), 300)
    return () => clearTimeout(timer)
  }, [shouldPrint])

  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer className="size-4" />
      Imprimer
    </Button>
  )
}
