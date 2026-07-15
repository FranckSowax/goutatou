'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { findSpinIndex, formatExpiryFr, nextRotationDeg, targetRotationDeg } from '@/lib/wheel'

export type WheelSegment =
  | { kind: 'prize'; id: string; label: string; imageUrl: string | null }
  | { kind: 'lose'; label: string }
  | { kind: 'retry'; label: string }

type SpinResponse =
  | { outcome: 'prize'; prizeId: string; label: string; code: string; expiresAt: string | null }
  | { outcome: 'lose' }
  | { outcome: 'retry'; retryToken: string | null }
  | { error: string }

type SpinResult =
  | { outcome: 'prize'; label: string; code: string; expiresAt: string | null }
  | { outcome: 'lose' }
  | { outcome: 'retry' }

function segmentColor(segment: WheelSegment, indexAmongAll: number, total: number): string {
  if (segment.kind === 'lose') return 'var(--muted-foreground)'
  if (segment.kind === 'retry') return 'var(--warning)'
  return `hsl(${(indexAmongAll * 360) / (total || 1)},70%,45%)`
}

export function Wheel({ token, segments }: { token: string; segments: WheelSegment[] }) {
  const [rotation, setRotation] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [result, setResult] = useState<SpinResult | null>(null)
  const [retryToken, setRetryToken] = useState<string | null>(null)
  const [retryUsed, setRetryUsed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function spin(tokenToUse: string) {
    if (spinning) return
    setSpinning(true); setError(null)
    const res = await fetch('/api/roue/spin', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: tokenToUse }),
    })
    const json = (await res.json().catch(() => ({}))) as SpinResponse
    if (!res.ok || 'error' in json) {
      setError(('error' in json && json.error) || 'Une erreur est survenue.')
      setSpinning(false)
      return
    }

    const idx = findSpinIndex(segments, json.outcome, json.outcome === 'prize' ? json.prizeId : undefined)
    const align = targetRotationDeg(idx, segments.length || 1, 0)
    setRotation((prev) => nextRotationDeg(prev, align))
    setTimeout(() => {
      if (json.outcome === 'prize') {
        setResult({ outcome: 'prize', label: json.label, code: json.code, expiresAt: json.expiresAt })
      } else if (json.outcome === 'lose') {
        setResult({ outcome: 'lose' })
      } else {
        setResult({ outcome: 'retry' })
        setRetryToken(json.retryToken)
      }
      setSpinning(false)
    }, 4200)
  }

  function handleRejouer() {
    if (retryUsed || !retryToken) return
    setRetryUsed(true)
    setResult(null)
    void spin(retryToken)
  }

  const sector = 360 / (segments.length || 1)
  // Rayon des libellés en % de la taille du conteneur (cqw) plutôt qu'en px fixe :
  // la roue n'a plus une taille fixe (80vw/340px/380px selon le breakpoint), donc
  // le placement radial doit suivre le conteneur réel. Ratio repris de l'ancien
  // radius=96 sur un conteneur fixe de 288px (96/288 ≈ 33.33%).
  const radius = '33.33cqw'

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative h-[80vw] max-h-[340px] w-[80vw] max-w-[340px] [container-type:inline-size] sm:h-[380px] sm:w-[380px]">
        <div className="absolute left-1/2 top-0 z-10 -ml-2 h-0 w-0 border-x-8 border-t-16 border-x-transparent border-t-yellow-400" />
        <div
          className="relative h-full w-full rounded-full border-4 border-yellow-400 transition-transform duration-4000 ease-out"
          style={{
            transform: `rotate(${rotation}deg)`,
            background: `conic-gradient(${segments.map((s, i) => `${segmentColor(s, i, segments.length)} ${i * sector}deg ${(i + 1) * sector}deg`).join(',')})`,
          }}
        >
          {segments.map((s, i) => {
            const mid = (i + 0.5) * sector
            return (
              <div
                key={s.kind === 'prize' ? s.id : `${s.kind}-${i}`}
                className="absolute left-1/2 top-1/2 flex h-0 w-0 items-start justify-center"
                style={{ transform: `rotate(${mid}deg) translateY(-${radius})` }}
              >
                <div className="flex flex-col items-center gap-1" style={{ transform: `rotate(${-mid}deg)` }}>
                  {s.kind === 'prize' && s.imageUrl ? (
                    <img
                      src={s.imageUrl}
                      alt={s.label}
                      className="h-8 w-8 rounded-full border border-white/70 object-cover shadow"
                    />
                  ) : (
                    <span className="max-w-16 text-center text-[10px] font-semibold leading-tight text-white drop-shadow">
                      {s.label}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!result && (
        <Button onClick={() => spin(token)} disabled={spinning} size="lg" className="h-auto rounded-full px-8 py-3 text-base">
          {spinning ? 'La roue tourne…' : 'Tourner la roue !'}
        </Button>
      )}
      {error && <p className="text-destructive">{error}</p>}

      {result?.outcome === 'prize' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent className="text-center">
            <p className="text-lg text-foreground">Vous avez gagné :</p>
            <p className="my-2 font-display text-lg text-foreground">{result.label}</p>
            <p className="text-muted-foreground">Votre code : <span className="font-mono text-2xl font-bold tracking-widest text-primary">{result.code}</span></p>
            <p className="mt-2 text-sm text-muted-foreground">Présentez ce code au restaurant. Envoyé aussi sur votre WhatsApp.</p>
            {result.expiresAt && (
              <p className="mt-2 text-sm font-medium text-warning">À utiliser avant le {formatExpiryFr(result.expiresAt)}</p>
            )}
          </CardContent>
        </Card>
      )}

      {result?.outcome === 'lose' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent className="text-center">
            <p className="text-lg text-foreground">Pas de chance cette fois… à la prochaine commande !</p>
          </CardContent>
        </Card>
      )}

      {result?.outcome === 'retry' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            <p className="text-lg text-foreground">Rejouez !</p>
            <Button onClick={handleRejouer} disabled={retryUsed || !retryToken} size="lg" className="h-auto rounded-full px-8 py-3 text-base">
              Rejouer
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
