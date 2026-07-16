'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { UtensilsCrossed } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const MIN_PASSWORD_LENGTH = 8

/**
 * Le gérant arrive ici via le lien d'invitation/récupération (`generateLink`, cf.
 * admin/actions.ts et admin/restaurants/[id]/actions.ts) : ce lien redirige depuis
 * `/auth/v1/verify` avec les jetons de session en fragment d'URL (#access_token=...). Le client
 * navigateur créé ici (mêmes options que `home-refresh.tsx` : `detectSessionInUrl` vaut true par
 * défaut côté navigateur) consomme ce fragment tout seul à l'initialisation — `getSession()`
 * attend cette initialisation avant de répondre, donc aucun code d'échange de session à écrire
 * ici. Si le lien est expiré/invalide, aucune session ne se pose : message FR fixe.
 */
export default function DefinirMotDePassePage() {
  const router = useRouter()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
      setChecking(false)
    })
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
      return
    }
    if (password !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.')
      return
    }

    setSaving(true)
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError('Impossible de définir le mot de passe. Réessayez.')
      return
    }
    router.push('/app')
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-sm rounded-2xl">
        <CardHeader className="items-center text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary mx-auto">
            <UtensilsCrossed className="size-5 text-primary-foreground" />
          </span>
          <h1 className="font-display text-3xl text-primary">Goutatou</h1>
          <p className="text-sm text-muted-foreground">Définir votre mot de passe</p>
        </CardHeader>
        <CardContent>
          {checking && <p className="text-sm text-muted-foreground">Vérification du lien…</p>}

          {!checking && !hasSession && (
            <p className="text-sm text-destructive">
              Lien expiré — demandez une nouvelle invitation.
            </p>
          )}

          {!checking && hasSession && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="password">Nouveau mot de passe</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Au moins 8 caractères"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="confirm-password">Confirmer le mot de passe</Label>
                <Input
                  id="confirm-password"
                  name="confirm_password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Ressaisissez le mot de passe"
                />
              </div>
              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? 'Enregistrement…' : 'Définir le mot de passe'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
