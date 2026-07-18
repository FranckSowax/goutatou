'use client'

import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { nextTier, tierStatus, type Reward } from '@/lib/loyalty'

const GENERIC_ERROR = 'Une erreur est survenue. Réessayez.'

const STATUS_BADGE: Record<ReturnType<typeof tierStatus>, { label: string; variant: 'muted' | 'warning' | 'success' }> = {
  a_venir: { label: 'À venir', variant: 'muted' },
  atteint: { label: 'Atteint', variant: 'warning' },
  recupere: { label: 'Récupéré', variant: 'success' },
}

export function LoyaltyCard({
  rid,
  token,
  restaurantName,
  logoUrl,
  coverUrl,
  stamps,
  customerName,
  birthdate,
  rewards,
  redeemedThresholds,
}: {
  rid: string
  token: string
  restaurantName: string
  logoUrl: string | null
  coverUrl: string | null
  stamps: number
  customerName: string | null
  birthdate: string | null
  rewards: Reward[]
  redeemedThresholds: number[]
}) {
  const [name, setName] = useState(customerName ?? '')
  const [birth, setBirth] = useState(birthdate ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mémorise le token de carte pour le scan caisse (POST auto /api/f/stamp).
  useEffect(() => {
    try {
      localStorage.setItem(`goutatou_card_${rid}`, token)
    } catch {
      // localStorage indisponible (mode privé strict) : le scan retombera sur le numéro.
    }
  }, [rid, token])

  const tier = nextTier(stamps, rewards)
  // Progression vers le prochain palier : part de la base du palier précédemment franchi.
  const previousThreshold = tier
    ? rewards
        .map((r) => r.threshold)
        .filter((t) => t <= stamps)
        .reduce((max, t) => Math.max(max, t), 0)
    : 0
  const span = tier ? tier.threshold - previousThreshold : 0
  const progress = tier && span > 0 ? Math.min(100, Math.round(((stamps - previousThreshold) / span) * 100)) : 100

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/f/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, name, birthdate: birth || undefined }),
      })
      const json = (await res.json().catch(() => ({ error: GENERIC_ERROR }))) as { ok?: boolean; error?: string }
      if (!res.ok || !json.ok) {
        setError(json.error || GENERIC_ERROR)
      } else {
        setSaved(true)
      }
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-5 bg-background p-4 pb-10">
      {/* Bandeau cover + logo rond */}
      <div className="relative">
        <div className="h-36 w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-primary/30 to-primary/5" />
          )}
        </div>
        <div className="absolute -bottom-8 left-4 size-20 overflow-hidden rounded-full border-4 border-background bg-card ring-1 ring-foreground/10">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={restaurantName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-primary/10 font-display text-2xl text-primary">
              {restaurantName.charAt(0)}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 px-1">
        <h1 className="font-display text-xl text-foreground">{restaurantName}</h1>
        <p className="text-sm text-muted-foreground">Carte de fidélité</p>
      </div>

      {/* Gros compteur */}
      <Card className="rounded-2xl">
        <CardContent className="flex flex-col items-center gap-1 py-2 text-center">
          <span className="font-display text-5xl leading-none text-primary">{stamps}</span>
          <span className="text-sm text-muted-foreground">{stamps > 1 ? 'commandes' : 'commande'}</span>

          {tier ? (
            <div className="mt-4 w-full">
              <p className="text-sm text-foreground">
                Plus que <span className="font-semibold text-primary">{tier.remaining}</span> pour «&nbsp;{tier.label}&nbsp;»
              </p>
              <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          ) : rewards.length > 0 ? (
            <p className="mt-4 text-sm font-medium text-primary">Tous les paliers atteints, bravo !</p>
          ) : null}
        </CardContent>
      </Card>

      {/* Liste des lots */}
      {rewards.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-sm font-medium text-foreground">Les lots</h2>
          {rewards.map((r) => {
            const status = tierStatus(r.threshold, stamps, redeemedThresholds)
            const badge = STATUS_BADGE[status]
            return (
              <Card key={r.threshold} className="rounded-xl" size="sm">
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.threshold} commandes</p>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </CardContent>
              </Card>
            )
          })}
        </section>
      )}

      {/* Profil */}
      <Card className="rounded-2xl">
        <CardContent>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="card-name" className="text-sm font-medium text-foreground">
                Votre nom
              </label>
              <Input
                id="card-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nom et prénom"
                disabled={saving}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="card-birth" className="text-sm font-medium text-foreground">
                Date de naissance
              </label>
              <Input
                id="card-birth"
                type="date"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
                disabled={saving}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && <p className="text-sm text-success">Informations enregistrées.</p>}
            <Button type="submit" disabled={saving} size="lg" className="rounded-full">
              {saving ? 'Un instant…' : 'Enregistrer'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
