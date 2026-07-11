'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateWheelSettings } from './actions'

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

export function WheelTab({
  restaurantId,
  wheelEnabled,
  wheelTriggerOrders,
}: {
  restaurantId: string
  wheelEnabled: boolean
  wheelTriggerOrders: number
}) {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      await updateWheelSettings(restaurantId, formData)
      setSaved(true)
    } catch (e) {
      setError(errorMessage(e, 'Impossible de mettre à jour la roue de la fidélité.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-2xl p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-base">Roue de la fidélité</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 px-0">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <form action={handleSubmit} className="flex flex-col gap-3">
          <Label className="flex w-fit items-center gap-2">
            <input
              type="checkbox"
              name="wheel_enabled"
              defaultChecked={wheelEnabled}
              className="size-4 accent-primary"
            />
            Roue activée
          </Label>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="wheel-trigger">Déclenchée toutes les N commandes</Label>
            <Input
              id="wheel-trigger"
              name="wheel_trigger_orders"
              type="number"
              min={1}
              defaultValue={wheelTriggerOrders}
              className="w-32"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            {saved && !saving && <span className="text-sm text-muted-foreground">Enregistré.</span>}
          </div>
        </form>

        <Button asChild variant="outline" className="self-start">
          <Link href="/app/fidelite">Gérer les lots</Link>
        </Button>
      </CardContent>
    </Card>
  )
}
