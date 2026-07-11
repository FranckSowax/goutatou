'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { redeemCode } from './actions'

export function RedeemForm() {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleSubmit(formData: FormData) {
    setResult(null)
    startTransition(async () => {
      try {
        await redeemCode(formData)
        setResult({ ok: true, message: 'Code validé.' })
      } catch (error) {
        // Fallback FR fixe : seul le message d'expiration (contrôlé côté serveur, pas de
        // détail sensible) est distingué du refus générique.
        const message = error instanceof Error && error.message === 'Ce lot a expiré.'
          ? 'Ce lot a expiré.'
          : 'Code invalide ou déjà utilisé.'
        setResult({ ok: false, message })
      }
    })
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        name="code"
        required
        maxLength={6}
        placeholder="Code client"
        className="flex-1 font-mono uppercase tracking-widest"
      />
      <Button type="submit" disabled={pending}>
        Valider
      </Button>
      {result && <Badge variant={result.ok ? 'success' : 'destructive'}>{result.message}</Badge>}
    </form>
  )
}
