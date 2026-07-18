'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const GENERIC_ERROR = 'Une erreur est survenue. Réessayez.'
const COOLDOWN_MSG = 'Commande déjà validée récemment. Revenez un peu plus tard.'

type StampResult = {
  stamps: number
  reachedThreshold: number | null
  reachedLabel: string | null
  token: string
}

type StampResponse = StampResult | { error: string }

type Phase = 'loading' | 'phone' | 'done'

export function StampClaim({
  rid,
  code,
  restaurantName,
}: {
  rid: string
  code: string
  restaurantName: string
}) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [phone, setPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<StampResult | null>(null)
  const [cardToken, setCardToken] = useState<string | null>(null)
  const autoRan = useRef(false)

  function applyResponse(res: Response, json: StampResponse, tokenForCard: string) {
    if (res.status === 429 && 'error' in json && json.error === 'cooldown') {
      setError(COOLDOWN_MSG)
      return false
    }
    if (!res.ok || 'error' in json) {
      setError(('error' in json && json.error) || GENERIC_ERROR)
      return false
    }
    setResult(json)
    setCardToken(json.token || tokenForCard)
    // Stocke / rafraîchit le token de carte pour les prochains scans.
    try {
      if (json.token) localStorage.setItem(`goutatou_card_${rid}`, json.token)
    } catch {
      /* localStorage indisponible */
    }
    setPhase('done')
    return true
  }

  // Au montage : si un token de carte est présent, on tamponne automatiquement.
  useEffect(() => {
    if (autoRan.current) return
    autoRan.current = true
    let storedToken: string | null = null
    try {
      storedToken = localStorage.getItem(`goutatou_card_${rid}`)
    } catch {
      storedToken = null
    }
    if (!storedToken) {
      setPhase('phone')
      return
    }
    void (async () => {
      try {
        const res = await fetch('/api/f/stamp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: storedToken }),
        })
        const json = (await res.json().catch(() => ({ error: GENERIC_ERROR }))) as StampResponse
        const ok = applyResponse(res, json, storedToken)
        if (!ok) setPhase('done')
      } catch {
        setError(GENERIC_ERROR)
        setPhase('done')
      }
    })()
  }, [rid])

  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/f/stamp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, phone }),
      })
      const json = (await res.json().catch(() => ({ error: GENERIC_ERROR }))) as StampResponse
      applyResponse(res, json, '')
    } catch {
      setError(GENERIC_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 bg-background p-6 text-center">
      <h1 className="font-display text-2xl text-foreground">{restaurantName}</h1>

      {phase === 'loading' && <p className="text-muted-foreground">Un instant…</p>}

      {phase === 'phone' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent>
            <form onSubmit={handlePhoneSubmit} className="flex flex-col gap-4 text-left">
              <p className="text-sm text-muted-foreground">
                Entrez votre numéro WhatsApp pour créditer votre carte de fidélité.
              </p>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="stamp-phone" className="text-sm font-medium text-foreground">
                  Votre numéro WhatsApp
                </label>
                <Input
                  id="stamp-phone"
                  type="tel"
                  inputMode="tel"
                  placeholder="+241 …"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  disabled={submitting}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                type="submit"
                disabled={submitting || phone.trim().length === 0}
                size="lg"
                className="rounded-full"
              >
                {submitting ? 'Un instant…' : 'Valider ma commande'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {phase === 'done' && (
        <Card className="w-full max-w-sm rounded-2xl">
          <CardContent className="flex flex-col items-center gap-3 text-center">
            {result ? (
              <>
                <p className="font-display text-2xl text-primary">+1 !</p>
                <p className="text-foreground">
                  Vous avez <span className="font-semibold">{result.stamps}</span>{' '}
                  {result.stamps > 1 ? 'commandes' : 'commande'}.
                </p>
                {result.reachedLabel && (
                  <p className="text-sm font-medium text-success">🎁 {result.reachedLabel}</p>
                )}
                {cardToken && (
                  <Button asChild variant="outline" size="lg" className="mt-1 rounded-full">
                    <Link href={`/f/${cardToken}`}>Voir ma carte</Link>
                  </Button>
                )}
              </>
            ) : (
              <p className="text-destructive">{error ?? GENERIC_ERROR}</p>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  )
}
