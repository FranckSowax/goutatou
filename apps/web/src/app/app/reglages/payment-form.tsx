'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePaymentSettings } from './actions'

export function PaymentForm({
  cashEnabled,
  airtelEnabled,
  airtelNumber,
  airtelName,
}: {
  cashEnabled: boolean
  airtelEnabled: boolean
  airtelNumber: string | null
  airtelName: string | null
}) {
  const [pending, startTransition] = useTransition()
  const [airtel, setAirtel] = useState(airtelEnabled)
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleSubmit(formData: FormData) {
    setResult(null)
    // Validation côté client : Next redige les messages d'erreur des Server Actions en prod,
    // on veut un message FR précis avant l'aller-retour (le serveur garde la même règle).
    const digits = String(formData.get('payment_airtel_number') ?? '').replace(/\D/g, '')
    if (formData.get('payment_airtel_enabled') === 'on' && digits.length < 8) {
      setResult({ ok: false, message: 'Numéro Airtel Money requis (ex. 077000000).' })
      return
    }
    startTransition(async () => {
      try {
        await updatePaymentSettings(formData)
        setResult({ ok: true, message: 'Réglages enregistrés.' })
      } catch {
        setResult({ ok: false, message: 'Enregistrement impossible.' })
      }
    })
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="payment_cash_enabled"
          defaultChecked={cashEnabled}
          className="size-4 accent-primary"
        />
        Paiement à la récupération / livraison (espèces)
      </label>

      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="payment_airtel_enabled"
          checked={airtel}
          onChange={(e) => setAirtel(e.target.checked)}
          className="size-4 accent-primary"
        />
        Airtel Money (vérification manuelle)
      </label>

      {airtel && (
        <div className="flex flex-col gap-4 rounded-xl border border-border p-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment_airtel_number">Numéro Airtel Money</Label>
            <Input
              id="payment_airtel_number"
              name="payment_airtel_number"
              defaultValue={airtelNumber ?? ''}
              inputMode="tel"
              placeholder="Ex. 077000000"
              className="min-h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="payment_airtel_name">Nom du titulaire</Label>
            <Input
              id="payment_airtel_name"
              name="payment_airtel_name"
              defaultValue={airtelName ?? ''}
              placeholder="Ex. Jean Mba"
              className="min-h-11"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Ce numéro et ce nom sont envoyés au client WhatsApp au moment de régler sa commande.
          </p>
        </div>
      )}

      {/* Champs conservés quand la section est repliée : sans eux, décocher Airtel effacerait
          silencieusement numéro et nom côté serveur (formData absent → null). */}
      {!airtel && (
        <>
          <input type="hidden" name="payment_airtel_number" value={airtelNumber ?? ''} />
          <input type="hidden" name="payment_airtel_name" value={airtelName ?? ''} />
        </>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="min-h-11 w-fit">
          Enregistrer
        </Button>
        {result && <Badge variant={result.ok ? 'success' : 'destructive'}>{result.message}</Badge>}
      </div>
    </form>
  )
}
