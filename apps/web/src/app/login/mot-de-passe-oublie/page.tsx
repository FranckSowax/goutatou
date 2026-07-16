'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { UtensilsCrossed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const NEUTRAL_MESSAGE = 'Si ce compte existe, un lien vient d’être envoyé sur le WhatsApp du restaurant.'

/**
 * Mot de passe oublié (self-service, cf. plan Task OB2 + spec § Sécurité). POST /api/auth/recovery
 * répond TOUJOURS `{ ok: true }` — aucune énumération de comptes possible. Cette page reflète cet
 * invariant : le message de succès est fixe et neutre, y compris en cas d'erreur réseau (le seul
 * cas distinct est le 429 rate-limit, qui ne révèle rien sur l'email saisi).
 */
export default function MotDePasseOubliePage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [isError, setIsError] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setIsError(false)

    try {
      const res = await fetch('/api/auth/recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      if (res.status === 429) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        setMessage(body?.error ?? 'Trop de tentatives. Réessayez plus tard.')
        setIsError(true)
      } else {
        // Neutre dans TOUS les autres cas, y compris une erreur réseau/serveur inattendue :
        // ne jamais révéler si le compte existe ou si l'envoi a réellement eu lieu.
        setMessage(NEUTRAL_MESSAGE)
      }
    } catch {
      setMessage(NEUTRAL_MESSAGE)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm rounded-2xl">
        <CardHeader className="items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary mx-auto">
            <UtensilsCrossed className="size-5 text-primary-foreground" />
          </span>
          <h1 className="font-display text-3xl text-primary">Goutatou</h1>
          <p className="text-sm text-muted-foreground">Mot de passe oublié</p>
        </CardHeader>
        <CardContent>
          {message ? (
            <p role="status" className={`text-sm ${isError ? 'text-destructive' : 'text-foreground'}`}>
              {message}
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Saisissez l’email de votre compte gérant : si un restaurant y est rattaché, un lien
                pour redéfinir votre mot de passe sera envoyé sur le WhatsApp de ce restaurant.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  placeholder="email@resto.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Envoi…' : 'Envoyer le lien'}
              </Button>
            </form>
          )}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link href="/login" className="underline underline-offset-4">
              Retour à la connexion
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
