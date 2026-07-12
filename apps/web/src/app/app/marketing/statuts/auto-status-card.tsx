'use client'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updateAutoStatus } from './actions'
import { StatusPreview } from './status-preview'
import { buildStatusCaptionPreview } from './auto-caption-preview'
import { AUTO_STATUS_COUNT_MAX, AUTO_STATUS_COUNT_MIN } from './shared'

export interface AutoStatusDish {
  id: string
  name: string
  price: number
  photoUrl: string
}

export interface AutoStatusCardProps {
  isPremium: boolean
  enabled: boolean
  times: string[]
  count: number
  lastSlot: string | null
  nextDishes: AutoStatusDish[]
}

function formatLastSlot(lastSlot: string | null): string {
  return lastSlot && lastSlot.trim() ? lastSlot : 'jamais'
}

const COUNT_OPTIONS = Array.from(
  { length: AUTO_STATUS_COUNT_MAX - AUTO_STATUS_COUNT_MIN + 1 },
  (_, i) => AUTO_STATUS_COUNT_MIN + i,
)

/**
 * Section « Statuts Auto 👑 » (premium) : toggle, 1-2 créneaux HH:MM, quota
 * 1-3 statuts/créneau, aperçu du prochain statut généré (plat suivant du
 * cursor de rotation + légende du moteur dupliqué en TS web — voir
 * auto-caption-preview.ts), dernier créneau exécuté. Non-premium : upsell
 * (rendu par le parent, cf. page.tsx / pattern campagnes).
 *
 * Soumission via `<form action={...}>` + useTransition (pattern
 * practical-info-form.tsx) — pas de handler client qui appelle la Server
 * Action hors formulaire.
 */
export function AutoStatusCard({ isPremium, enabled, times, count, lastSlot, nextDishes }: AutoStatusCardProps) {
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [time1, setTime1] = useState(times[0] ?? '')
  const [time2, setTime2] = useState(times[1] ?? '')
  const [hasSecondSlot, setHasSecondSlot] = useState(times.length > 1)
  const [countValue, setCountValue] = useState(count)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  if (!isPremium) {
    return (
      <Card className="rounded-2xl border-primary/30 bg-accent p-6 text-center">
        <p className="font-display text-xl font-semibold text-accent-foreground">Statuts Auto 👑</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Publiez automatiquement vos plats en statut chaque jour. Réservé au plan{' '}
          <strong>Premium</strong>. Contactez Goutatou pour l’activer.
        </p>
      </Card>
    )
  }

  function handleSubmit(formData: FormData) {
    setResult(null)
    startTransition(async () => {
      try {
        await updateAutoStatus(formData)
        setResult({ ok: true, message: 'Réglages enregistrés.' })
      } catch (err) {
        // Next redige les messages d'erreur des Server Actions en prod (texte
        // anglais générique) : on affiche TOUJOURS un message FR — le nôtre
        // s'il est disponible, sinon un message FR fixe.
        const message =
          err instanceof Error && err.message && !/^An error occurred/i.test(err.message)
            ? err.message
            : 'Enregistrement impossible.'
        setResult({ ok: false, message })
      }
    })
  }

  const previewDish = nextDishes[0] ?? null

  return (
    <Card className="rounded-2xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Statuts Auto 👑</h2>
      <form action={handleSubmit} className="grid gap-6 lg:grid-cols-[1fr_auto]">
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="enabled"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="accent-primary"
            />
            Activé
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auto-time-1">Créneau 1</Label>
            <Input
              id="auto-time-1"
              name="time_1"
              type="time"
              value={time1}
              onChange={(e) => setTime1(e.target.value)}
              required
              className="w-32"
            />
          </div>

          {hasSecondSlot ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="auto-time-2">Créneau 2</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setHasSecondSlot(false)
                    setTime2('')
                  }}
                >
                  Retirer
                </Button>
              </div>
              <Input
                id="auto-time-2"
                name="time_2"
                type="time"
                value={time2}
                onChange={(e) => setTime2(e.target.value)}
                required
                className="w-32"
              />
            </div>
          ) : (
            <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setHasSecondSlot(true)}>
              Ajouter un second créneau
            </Button>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="auto-count">Statuts par créneau</Label>
            <select
              id="auto-count"
              name="count"
              value={countValue}
              onChange={(e) => setCountValue(Number(e.target.value))}
              className="h-9 w-20 rounded-lg border border-input bg-transparent px-2 text-sm"
            >
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <p className="text-sm text-muted-foreground">Dernier créneau exécuté : {formatLastSlot(lastSlot)}</p>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            {result && <Badge variant={result.ok ? 'success' : 'destructive'}>{result.message}</Badge>}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Aperçu du prochain statut</span>
          {previewDish ? (
            <StatusPreview
              data={{
                kind: 'image',
                content: buildStatusCaptionPreview(previewDish, 0),
                mediaUrl: previewDish.photoUrl,
                bgColor: '#1F2C34',
                captionColor: '#FFFFFF',
                fontType: 0,
              }}
            />
          ) : (
            <p className="max-w-56 text-center text-sm text-muted-foreground">
              Aucun plat disponible avec photo pour le moment — ajoutez une photo à un plat du menu.
            </p>
          )}
        </div>
      </form>
    </Card>
  )
}
