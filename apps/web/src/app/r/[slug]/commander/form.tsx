'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { formatFcfa } from '@goutatou/db/types'
import { useCart } from '@/components/lp/CartProvider'
import { cartLineUnitPrice, lineKey } from '@/lib/lp/cart'

export function CheckoutForm({ slug, driveEnabled, driveSlots }: {
  slug: string; driveEnabled: boolean; driveSlots: { id: string; label: string }[]
}) {
  const router = useRouter()
  const { items, setQty, total, clear } = useCart()
  const [mode, setMode] = useState<'drive' | 'livraison' | 'sur_place'>(driveEnabled ? 'drive' : 'sur_place')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setPending(true); setError(null)
    const fd = new FormData(e.currentTarget)
    const res = await fetch(`/api/lp/${slug}/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: fd.get('name'),
        phone: fd.get('phone'),
        mode,
        driveSlotId: fd.get('slot') || undefined,
        address: fd.get('address') || undefined,
        items: items.map((i) => ({
          menuItemId: i.menuItemId,
          qty: i.qty,
          ...(i.supplements.length > 0 ? { supplementIds: i.supplements.map((s) => s.id) } : {}),
        })),
      }),
    })
    const json = await res.json().catch(() => ({}))
    setPending(false)
    if (!res.ok) { setError(json.error ?? 'Une erreur est survenue.'); return }
    clear()
    router.push(`/r/${slug}/merci?n=${json.orderNumber}&t=${json.total}`)
  }

  if (items.length === 0) {
    return <p className="opacity-70">Votre panier est vide. <a className="underline" href={`/r/${slug}#carte`}>Voir la carte</a></p>
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <ul className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
        {items.map((it) => (
          <li key={lineKey(it)} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <span>{it.name}</span>
              <span className="flex items-center gap-2">
                <button type="button" aria-label="Moins" onClick={() => setQty(lineKey(it), it.qty - 1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 sm:h-7 sm:w-7">−</button>
                <span className="w-6 text-center">{it.qty}</span>
                <button type="button" aria-label="Plus" onClick={() => setQty(lineKey(it), it.qty + 1)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/30 sm:h-7 sm:w-7">+</button>
                <span className="ml-2 w-24 text-right font-semibold">{formatFcfa(cartLineUnitPrice(it) * it.qty)}</span>
              </span>
            </div>
            {it.supplements.map((s) => (
              <p key={s.id} className="pl-3 text-sm opacity-70">↳ {s.name} +{formatFcfa(s.price)}</p>
            ))}
          </li>
        ))}
        <li className="flex justify-between border-t border-white/10 pt-3 font-bold">
          <span>Total</span><span>{formatFcfa(total)}</span>
        </li>
      </ul>

      <input name="name" required minLength={2} placeholder="Votre nom"
        className="rounded-xl border border-white/20 bg-transparent p-3" />
      <input name="phone" required placeholder="Numéro WhatsApp (ex. 077 12 34 56)" inputMode="tel"
        className="rounded-xl border border-white/20 bg-transparent p-3" />

      <div className="flex gap-2">
        {([['drive', '🚗 Drive'], ['livraison', '🛵 Livraison'], ['sur_place', '🥡 À emporter']] as const)
          .filter(([m]) => m !== 'drive' || driveEnabled)
          .map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className="flex-1 rounded-xl border p-2 text-sm"
              style={mode === m
                ? { backgroundColor: 'var(--lp-primary)', borderColor: 'var(--lp-primary)', color: '#fff' }
                : { borderColor: 'rgba(255,255,255,0.2)' }}>
              {label}
            </button>
          ))}
      </div>

      {mode === 'drive' && (
        <select name="slot" required className="rounded-xl border border-white/20 bg-transparent p-3">
          <option value="">Choisissez un créneau de retrait</option>
          {driveSlots.map((s) => <option key={s.id} value={s.id} className="text-black">{s.label}</option>)}
        </select>
      )}
      {mode === 'livraison' && (
        <input name="address" required minLength={5} placeholder="Adresse (quartier + repère)"
          className="rounded-xl border border-white/20 bg-transparent p-3" />
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button disabled={pending}
        className="rounded-xl p-3 font-bold text-white disabled:opacity-50"
        style={{ backgroundColor: 'var(--lp-primary)' }}>
        {pending ? 'Envoi…' : `Confirmer — ${formatFcfa(total)} à la remise`}
      </button>
      <p className="text-center text-xs opacity-50">Paiement à la remise (espèces ou Mobile Money au comptoir).</p>
    </form>
  )
}
