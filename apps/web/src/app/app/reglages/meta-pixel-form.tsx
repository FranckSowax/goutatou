'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateMetaPixelId } from './actions'

export function MetaPixelForm({ metaPixelId }: { metaPixelId: string | null }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleSubmit(formData: FormData) {
    setResult(null)
    startTransition(async () => {
      try {
        await updateMetaPixelId(formData)
        setResult({ ok: true, message: 'Pixel enregistré.' })
      } catch {
        // Next redige les messages d'erreur des Server Actions en prod : message FR fixe.
        setResult({ ok: false, message: 'Enregistrement impossible.' })
      }
    })
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="meta_pixel_id">Meta Pixel ID</Label>
        <Input
          id="meta_pixel_id"
          name="meta_pixel_id"
          defaultValue={metaPixelId ?? ''}
          inputMode="numeric"
          placeholder="Ex. 123456789012345"
        />
        <p className="text-xs text-muted-foreground">
          Collez l’ID de votre pixel Meta pour tracer les vues, ajouts au panier et achats de votre
          carte en ligne. Laissez vide pour désactiver le suivi.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="w-fit">
          Enregistrer
        </Button>
        {result && <Badge variant={result.ok ? 'success' : 'destructive'}>{result.message}</Badge>}
      </div>
    </form>
  )
}
