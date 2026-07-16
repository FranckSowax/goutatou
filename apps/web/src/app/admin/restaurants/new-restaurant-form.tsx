'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createRestaurant } from '../actions'

/**
 * Formulaire de création — en client component pour pouvoir afficher le lien d'invitation
 * renvoyé par `createRestaurant` (Server Component + <form action> ne permet pas de lire la
 * valeur de retour). Import direct de l'action serveur (jamais passée en prop) : pattern déjà
 * utilisé par `general-tab.tsx` pour `updateRestaurantProfile`/`updatePlan`.
 * Le lien ne s'affiche qu'ici, une seule fois : à la création, le canal Whapi n'est pas encore
 * appairé et `contact_phone` n'existe pas encore côté fiche — l'admin l'envoie comme il veut.
 */
export function NewRestaurantForm() {
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(formData: FormData) {
    setSaving(true)
    setError(null)
    setInviteLink(null)
    try {
      const { inviteLink } = await createRestaurant(formData)
      setInviteLink(inviteLink)
    } catch {
      // Next redige les messages d'erreur des Server Actions en prod : message FR fixe.
      setError('Impossible de créer le restaurant. Vérifiez les champs et réessayez.')
    } finally {
      setSaving(false)
    }
  }

  async function onCopy() {
    if (!inviteLink) return
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="rounded-2xl p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-lg">Nouveau restaurant</CardTitle>
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
        {inviteLink && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium">
              Restaurant créé — lien d&apos;invitation du gérant (à copier maintenant, il ne
              sera plus réaffiché) :
            </p>
            <p className="w-full truncate text-xs text-muted-foreground" title={inviteLink}>
              {inviteLink}
            </p>
            <Button type="button" variant="outline" size="sm" onClick={onCopy} className="w-fit">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {copied ? 'Copié' : 'Copier le lien'}
            </Button>
          </div>
        )}
        <form action={handleSubmit} className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-resto-name">Nom du restaurant</Label>
            <Input id="new-resto-name" name="name" required placeholder="Nom du restaurant" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-resto-slug">Slug</Label>
            <Input
              id="new-resto-slug"
              name="slug"
              required
              placeholder="slug (ex. chez-mama)"
              pattern="[a-z0-9-]{2,40}"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="new-resto-owner-email">Email du gérant</Label>
            <Input id="new-resto-owner-email" name="owner_email" required type="email" placeholder="Email du gérant" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="new-resto-whapi-token">Token du canal Whapi</Label>
            <Input id="new-resto-whapi-token" name="whapi_token" required placeholder="Token du canal Whapi" />
          </div>
          <Button type="submit" disabled={saving} className="sm:col-span-2">
            {saving ? 'Création…' : 'Créer le restaurant'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
