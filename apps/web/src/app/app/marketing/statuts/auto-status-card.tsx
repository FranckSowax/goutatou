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
import { AUTO_STATUS_COUNT_MAX, AUTO_STATUS_COUNT_MIN, type AutoStatusValidationMode } from './shared'

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
  validation: AutoStatusValidationMode
  managerPhone: string | null
  contactPhone: string | null
  staffGroupId: string | null
  echoChannel: boolean
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
export function AutoStatusCard({
  isPremium,
  enabled,
  times,
  count,
  lastSlot,
  nextDishes,
  validation,
  managerPhone,
  contactPhone,
  staffGroupId,
  echoChannel,
}: AutoStatusCardProps) {
  const [isEnabled, setIsEnabled] = useState(enabled)
  const [time1, setTime1] = useState(times[0] ?? '')
  const [time2, setTime2] = useState(times[1] ?? '')
  const [hasSecondSlot, setHasSecondSlot] = useState(times.length > 1)
  const [countValue, setCountValue] = useState(count)
  const [validationMode, setValidationMode] = useState<AutoStatusValidationMode>(validation)
  const [echoChannelEnabled, setEchoChannelEnabled] = useState(echoChannel)
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
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="rounded-2xl p-6 lg:col-span-2">
        <h2 className="mb-4 font-display text-lg font-semibold">Statuts Auto 👑</h2>
        <form action={handleSubmit} className="flex flex-col gap-6">
          <label className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm font-medium">
            <input
              type="checkbox"
              name="enabled"
              checked={isEnabled}
              onChange={(e) => setIsEnabled(e.target.checked)}
              className="size-4 accent-primary"
            />
            Publication automatique activée
          </label>

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auto-time-1">Créneau 1</Label>
              <Input
                id="auto-time-1"
                name="time_1"
                type="time"
                value={time1}
                onChange={(e) => setTime1(e.target.value)}
                required
                className="w-full"
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
                  className="w-full"
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>Créneau 2</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setHasSecondSlot(true)}
                >
                  Ajouter un second créneau
                </Button>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auto-count">Statuts par créneau</Label>
              <select
                id="auto-count"
                name="count"
                value={countValue}
                onChange={(e) => setCountValue(Number(e.target.value))}
                className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {COUNT_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auto-validation">Validation avant publication</Label>
              <select
                id="auto-validation"
                name="validation"
                value={validationMode}
                onChange={(e) => setValidationMode(e.target.value as AutoStatusValidationMode)}
                className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                <option value="none">Aucune</option>
                <option value="manager">Gérant</option>
                <option value="group">Groupe staff</option>
              </select>
            </div>
          </div>

          {validationMode === 'manager' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="auto-manager-phone">Numéro du gérant validateur</Label>
              <Input
                id="auto-manager-phone"
                name="manager_phone"
                type="tel"
                defaultValue={managerPhone ?? ''}
                placeholder={contactPhone ?? '241…'}
                className="w-full sm:max-w-xs"
              />
            </div>
          )}

          {validationMode === 'group' && (
            <div className="flex flex-col gap-1 text-sm text-muted-foreground">
              <p>Le groupe Cuisine votera à chaque publication.</p>
              {!staffGroupId && (
                <p className="text-destructive">Créez d’abord le groupe Cuisine (fiche réglages).</p>
              )}
            </div>
          )}

          <label className="flex items-center gap-3 rounded-xl border border-border p-4 text-sm font-medium">
            <input
              type="checkbox"
              name="echo_channel"
              checked={echoChannelEnabled}
              onChange={(e) => setEchoChannelEnabled(e.target.checked)}
              className="size-4 accent-primary"
            />
            Écho chaîne par défaut
          </label>

          <p className="text-sm text-muted-foreground">Dernier créneau exécuté : {formatLastSlot(lastSlot)}</p>

          <div className="flex items-center gap-3 border-t border-border pt-4">
            <Button type="submit" disabled={pending} className="w-fit">
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            {result && <Badge variant={result.ok ? 'success' : 'destructive'}>{result.message}</Badge>}
          </div>
        </form>
      </Card>

      <aside className="lg:col-span-1">
        <Card className="rounded-2xl p-6 lg:sticky lg:top-4">
          <div className="flex flex-col items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground">Aperçu du prochain statut</span>
            {previewDish ? (
              <StatusPreview
                className="max-w-xs"
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
        </Card>
      </aside>
    </div>
  )
}
