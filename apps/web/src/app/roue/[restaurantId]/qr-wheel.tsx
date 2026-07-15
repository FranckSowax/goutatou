'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatExpiryFr } from '@/lib/wheel'
import { indexForOutcome, targetRotation, type WheelSeg } from '@/lib/wheel-geometry'
import { WheelSvg } from './wheel-svg'
import { useConfetti } from './use-confetti'

export type ActionOption = { key: 'google' | 'tiktok' | 'channel'; label: string; url: string }

type Phase = 'idle' | 'waiting' | 'form' | 'spinning' | 'result'

type ResultState =
  | { outcome: 'prize'; label: string; code: string; expiresAt: string | null }
  | { outcome: 'lose' }
  | { outcome: 'retry' }

type UnlockResponse = { token: string } | { error: string; nextEligibleAt?: string }

type SpinResponse =
  | { outcome: 'prize'; prizeId: string; label: string; code: string; expiresAt: string | null }
  | { outcome: 'lose' }
  | { outcome: 'retry'; retryToken: string | null }
  | { error: string }

const WAIT_SECONDS = 25
const SPIN_MS = 5200
const GENERIC_ERROR = 'Une erreur est survenue. Réessayez.'

export function QrWheel({
  restaurantId,
  segments,
  actions,
}: {
  restaurantId: string
  segments: WheelSeg[]
  actions: ActionOption[]
}) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [selectedAction, setSelectedAction] = useState<ActionOption | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(WAIT_SECONDS)
  const [phone, setPhone] = useState('')
  const [optIn, setOptIn] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<ResultState | null>(null)
  const [retryToken, setRetryToken] = useState<string | null>(null)
  const [retryBusy, setRetryBusy] = useState(false)

  const wheelWrapRef = useRef<HTMLDivElement>(null)
  const { canvasRef, fire } = useConfetti()

  useEffect(() => {
    if (phase !== 'waiting') return
    if (secondsLeft <= 0) return
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(id)
  }, [phase, secondsLeft])

  function handleActionClick(action: ActionOption) {
    window.open(action.url, '_blank', 'noopener,noreferrer')
    setSelectedAction(action)
    setSecondsLeft(WAIT_SECONDS)
    setError(null)
    setPhase('waiting')
  }

  function handleDone() {
    if (secondsLeft > 0) return
    setPhase('form')
  }

  function playOutcome(spin: SpinResponse) {
    if ('error' in spin) {
      setError(spin.error || GENERIC_ERROR)
      setSpinning(false)
      setSubmitting(false)
      setRetryBusy(false)
      return
    }

    const prizeId = spin.outcome === 'prize' ? spin.prizeId : undefined
    const index = indexForOutcome(segments, spin.outcome, prizeId)

    const showResult = () => {
      setSpinning(false)
      setSubmitting(false)
      setRetryBusy(false)
      if (spin.outcome === 'prize') {
        setResult({ outcome: 'prize', label: spin.label, code: spin.code, expiresAt: spin.expiresAt })
        const rect = wheelWrapRef.current?.getBoundingClientRect()
        fire(rect ? rect.left + rect.width / 2 : undefined, rect ? rect.top + rect.height / 2 : undefined)
      } else if (spin.outcome === 'lose') {
        setResult({ outcome: 'lose' })
      } else {
        setResult({ outcome: 'retry' })
        setRetryToken(spin.retryToken)
      }
      setPhase('result')
    }

    if (index < 0) {
      // Aucun segment visuel ne correspond au résultat serveur (config de lots désynchronisée) :
      // ne pas animer un atterrissage trompeur sur un AUTRE lot que celui annoncé, afficher le
      // résultat réel directement.
      console.error('[qr-wheel] segment introuvable pour le résultat', spin.outcome, prizeId)
      showResult()
      return
    }

    const rand = Math.random()
    setRotation((prev) => targetRotation(index, segments.length || 1, prev, rand))
    setSpinning(true)
    setPhase('spinning')
    setTimeout(showResult, SPIN_MS)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedAction || submitting) return
    setSubmitting(true)
    setError(null)

    try {
      const unlockRes = await fetch('/api/roue/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restaurantId, phone, action: selectedAction.key, optIn }),
      })
      const unlockJson = (await unlockRes.json().catch(() => ({ error: GENERIC_ERROR }))) as UnlockResponse
      if (!unlockRes.ok || 'error' in unlockJson) {
        setError(('error' in unlockJson && unlockJson.error) || GENERIC_ERROR)
        setSubmitting(false)
        return
      }

      const spinRes = await fetch('/api/roue/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: unlockJson.token, action: selectedAction.key }),
      })
      const spinJson = (await spinRes.json().catch(() => ({ error: GENERIC_ERROR }))) as SpinResponse
      playOutcome(spinJson)
    } catch {
      setError(GENERIC_ERROR)
      setSubmitting(false)
    }
  }

  async function handleReplay() {
    if (!retryToken || retryBusy || !selectedAction) return
    setRetryBusy(true)
    setError(null)
    setResult(null)
    try {
      const res = await fetch('/api/roue/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: retryToken, action: selectedAction.key }),
      })
      const json = (await res.json().catch(() => ({ error: GENERIC_ERROR }))) as SpinResponse
      playOutcome(json)
    } catch {
      setError(GENERIC_ERROR)
      setRetryBusy(false)
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-50" />

      <div ref={wheelWrapRef}>
        <WheelSvg segments={segments} rotation={rotation} spinning={spinning} />
      </div>

      {phase === 'idle' && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Choisissez une action pour débloquer votre tour de roue :
          </p>
          {actions.map((action) => (
            <Button key={action.key} onClick={() => handleActionClick(action)} size="lg" className="h-auto rounded-full px-6 py-3 text-base">
              {action.label}
            </Button>
          ))}
        </div>
      )}

      {phase === 'waiting' && selectedAction && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <p className="text-foreground">Ouvrez « {selectedAction.label} » dans l'onglet qui vient de s'ouvrir.</p>
            <p className="text-sm text-muted-foreground">Une fois fait, revenez ici et validez.</p>
            <Button onClick={handleDone} disabled={secondsLeft > 0} size="lg" className="h-auto rounded-full px-8 py-3 text-base">
              {secondsLeft > 0 ? `J'ai terminé (${secondsLeft}s)` : "J'ai terminé"}
            </Button>
          </CardContent>
        </Card>
      )}

      {phase === 'form' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-left">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="wheel-phone" className="text-sm font-medium text-foreground">
                  Votre numéro WhatsApp
                </label>
                <Input
                  id="wheel-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+241 …"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={optIn}
                  onChange={(e) => setOptIn(e.target.checked)}
                  className="mt-0.5 size-4 accent-primary"
                />
                J'accepte de recevoir mon gain et les offres du restaurant — STOP pour me désabonner.
              </label>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={submitting || phone.trim().length === 0} size="lg" className="h-auto rounded-full px-8 py-3 text-base">
                {submitting ? 'Un instant…' : 'Tourner !'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {phase === 'spinning' && <p className="text-lg text-foreground">La roue tourne…</p>}

      {phase === 'result' && result?.outcome === 'prize' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent className="text-center">
            <p className="text-lg text-foreground">Vous avez gagné :</p>
            <p className="my-2 font-display text-lg text-foreground">{result.label}</p>
            <p className="text-muted-foreground">
              Votre code : <span className="font-mono text-2xl font-bold tracking-widest text-primary">{result.code}</span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">Présentez ce code au restaurant. Envoyé aussi sur votre WhatsApp.</p>
            {result.expiresAt && (
              <p className="mt-2 text-sm font-medium text-warning">À utiliser avant le {formatExpiryFr(result.expiresAt)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {phase === 'result' && result?.outcome === 'lose' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent className="text-center">
            <p className="text-lg text-foreground">Pas de chance cette fois… à bientôt !</p>
          </CardContent>
        </Card>
      )}

      {phase === 'result' && result?.outcome === 'retry' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <p className="text-lg text-foreground">Rejouez !</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={handleReplay} disabled={retryBusy || !retryToken} size="lg" className="h-auto rounded-full px-8 py-3 text-base">
              {retryBusy ? 'Un instant…' : 'Rejouer'}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
