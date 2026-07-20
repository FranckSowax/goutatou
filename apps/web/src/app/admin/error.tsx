'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Frontière d'erreur de l'espace admin (/admin/*) — même page FR sobre que /app/error.tsx.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-2xl font-semibold">Une erreur est survenue</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Vérifiez votre connexion puis réessayez. Si le problème persiste, rechargez la page.
      </p>
      <Button onClick={reset}>Réessayer</Button>
    </div>
  )
}
