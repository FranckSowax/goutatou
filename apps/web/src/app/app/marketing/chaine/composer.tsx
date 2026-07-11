'use client'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { sendChannelMessageAction } from './actions'

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

export function Composer() {
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function onSubmit(formData: FormData) {
    setSending(true)
    setError(null)
    setSent(false)
    try {
      await sendChannelMessageAction(formData)
      setSent(true)
      setBody('')
      setImageUrl('')
    } catch (e) {
      setError(errorMessage(e, 'La chaîne n’est pas disponible sur ce canal.'))
    } finally {
      setSending(false)
    }
  }

  return (
    <Card className="rounded-2xl p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-base">Publier sur la chaîne</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {error && (
          <div
            role="alert"
            className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </div>
        )}
        <form action={onSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chaine-body">Message</Label>
            <Textarea
              id="chaine-body"
              name="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Votre actualité, promotion…"
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="chaine-image-url">URL de l&apos;image (optionnel)</Label>
            <Input
              id="chaine-image-url"
              name="image_url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={sending}>
              {sending ? 'Publication…' : 'Publier'}
            </Button>
            {sent && !sending && <span className="text-sm text-muted-foreground">Publié.</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
