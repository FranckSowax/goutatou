'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { createChannelAction } from './actions'

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

export function CreateChannelCard({ restaurantName }: { restaurantName: string }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onCreate() {
    setSaving(true)
    setError(null)
    try {
      await createChannelAction()
    } catch (e) {
      setError(errorMessage(e, 'Impossible de créer la chaîne — vérifiez que votre canal WhatsApp est connecté.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="rounded-2xl p-6 text-center">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-lg">Créer votre chaîne WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 px-0">
        <p className="text-sm text-muted-foreground">
          Diffusez vos actualités et promotions à tous vos abonnés WhatsApp.
        </p>
        {error && (
          <div
            role="alert"
            className="w-full rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <Button type="button" onClick={onCreate} disabled={saving}>
          {saving ? 'Création…' : `Créer la chaîne ${restaurantName}`}
        </Button>
      </CardContent>
    </Card>
  )
}
