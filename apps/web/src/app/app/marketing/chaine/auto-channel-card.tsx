'use client'
import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { saveAutoChannelSettings } from './actions'
import { AUTO_CHANNEL_COUNT_MAX, AUTO_CHANNEL_COUNT_MIN } from './shared'

export interface AutoChannelCardProps {
  enabled: boolean
  times: string[]
  count: number
  /** Mode de validation hérité des Statuts Auto (lecture seule ici — réglable dans Statuts). */
  validationMode: 'none' | 'manager' | 'group'
}

const VALIDATION_LABELS: Record<'none' | 'manager' | 'group', string> = {
  none: 'Aucune',
  manager: 'Gérant',
  group: 'Groupe staff',
}

const COUNT_OPTIONS = Array.from(
  { length: AUTO_CHANNEL_COUNT_MAX - AUTO_CHANNEL_COUNT_MIN + 1 },
  (_, i) => AUTO_CHANNEL_COUNT_MIN + i,
)

/**
 * Section « Chaîne Auto 👑 » (premium) : toggle, 1-2 créneaux HH:MM, quota
 * 1-3 posts/créneau. La validation avant publication est réutilisée à
 * l'identique des Statuts Auto (aucune nouvelle colonne, cf. plan Chaîne
 * Auto) — affichée ici en lecture seule avec un renvoi vers Statuts.
 *
 * Soumission via `<form action={...}>` + useTransition (pattern
 * auto-status-card.tsx) — pas de handler client hors formulaire, et pas de
 * prop fonction reçue d'un Server Component (ce composant importe l'action
 * lui-même).
 */
export function AutoChannelCard({ enabled, times, count, validationMode }: AutoChannelCardProps) {
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [time1, setTime1] = useState(times[0] ?? '')
  const [time2, setTime2] = useState(times[1] ?? '')
  const [hasSecondSlot, setHasSecondSlot] = useState(times.length > 1)
  const [countValue, setCountValue] = useState(count)
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleSubmit(formData: FormData) {
    setResult(null)
    startTransition(async () => {
      try {
        await saveAutoChannelSettings(formData)
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

  return (
    <Card className="rounded-2xl p-6">
      <h2 className="mb-4 font-display text-lg font-semibold">Chaîne Auto 👑</h2>
      <form action={handleSubmit} className="flex flex-col gap-4">
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
          <Label htmlFor="auto-channel-time-1">Créneau 1</Label>
          <Input
            id="auto-channel-time-1"
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
              <Label htmlFor="auto-channel-time-2">Créneau 2</Label>
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
              id="auto-channel-time-2"
              name="time_2"
              type="time"
              value={time2}
              onChange={(e) => setTime2(e.target.value)}
              required
              className="w-32"
            />
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setHasSecondSlot(true)}
          >
            Ajouter un second créneau
          </Button>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="auto-channel-count">Posts par créneau</Label>
          <select
            id="auto-channel-count"
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

        <p className="text-sm text-muted-foreground">
          Validation : {VALIDATION_LABELS[validationMode]} — réglable dans Statuts.
        </p>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="w-fit">
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
          {result && <Badge variant={result.ok ? 'success' : 'destructive'}>{result.message}</Badge>}
        </div>
      </form>
    </Card>
  )
}
