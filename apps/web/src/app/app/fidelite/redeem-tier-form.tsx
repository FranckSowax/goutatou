'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { findRedeemableTiers, redeemTier, type RedeemableTiers } from './actions'

/**
 * Onglet « Valider un lot » : saisie du numéro client → paliers atteints (stamps ≥ seuil) avec
 * bouton « Marquer remis » pour ceux non encore récupérés. Modèle de redeem-form.tsx.
 */
export function RedeemTierForm() {
  const [pending, startTransition] = useTransition()
  const [phone, setPhone] = useState('')
  const [result, setResult] = useState<RedeemableTiers | null>(null)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function search(currentPhone: string) {
    setError(null)
    startTransition(async () => {
      try {
        const res = await findRedeemableTiers(currentPhone)
        setResult(res)
        setSearched(true)
      } catch {
        setError('Recherche impossible.')
      }
    })
  }

  function handleSearch(formData: FormData) {
    const value = String(formData.get('phone') ?? '').trim()
    setPhone(value)
    search(value)
  }

  function handleRedeem(customerId: string, threshold: number) {
    setError(null)
    startTransition(async () => {
      try {
        await redeemTier(customerId, threshold)
        // Rafraîchit la liste après la remise.
        const res = await findRedeemableTiers(phone)
        setResult(res)
      } catch {
        setError('Validation impossible.')
      }
    })
  }

  const reachedTiers = result?.found
    ? result.tiers.filter((t) => t.threshold <= result.stamps)
    : []

  return (
    <div className="flex flex-col gap-4">
      <form action={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          name="phone"
          required
          type="tel"
          inputMode="tel"
          placeholder="Numéro WhatsApp du client"
          className="flex-1"
        />
        <Button type="submit" disabled={pending}>
          Rechercher
        </Button>
      </form>

      {error && <Badge variant="destructive">{error}</Badge>}

      {searched && result && !result.found && (
        <p className="text-sm text-muted-foreground">Aucun client trouvé pour ce numéro.</p>
      )}

      {result?.found && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
            <span className="font-medium">{result.customerName || 'Client'}</span>
            <span className="text-sm text-muted-foreground">{result.stamps} commande(s) cumulée(s)</span>
          </div>

          {reachedTiers.length === 0 && (
            <p className="text-sm text-muted-foreground">Aucun palier atteint pour l’instant.</p>
          )}

          <ul className="flex flex-col gap-2">
            {reachedTiers.map((tier) => (
              <li
                key={tier.threshold}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3"
              >
                <div className="flex flex-col">
                  <span className="font-medium">{tier.label}</span>
                  <span className="text-xs text-muted-foreground">{tier.threshold} commandes</span>
                </div>
                {tier.redeemed ? (
                  <Badge variant="muted">Déjà remis</Badge>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    disabled={pending}
                    onClick={() => result.customerId && handleRedeem(result.customerId, tier.threshold)}
                  >
                    Marquer remis
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
