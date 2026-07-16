'use client'
import { useEffect, useRef, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { formatFcfa } from '@goutatou/db/types'
import { decideAlert } from '@/lib/live-alert'
import { ensureAudio, startAlert, stopAlert } from '@/lib/chime'

// Cuisine Live (CL2) — overlay plein écran + carillon branchés sur le Realtime `orders`.
// Comportement porté depuis docs/superpowers/specs/2026-07-13-cuisine-live-design.md,
// habillé aux tokens Goutatou (aucune couleur en dur). Voir apps/web/src/lib/live-alert.ts
// (décision pure) et apps/web/src/lib/chime.ts (Web Audio) pour les briques CL1.

const ORDER_AUTO_CLOSE_MS = 10_000
const ARRIVAL_AUTO_CLOSE_MS = 15_000

// Forme minimale de la ligne `orders` telle qu'attendue par `decideAlert`. `payload.new`/`payload.old`
// de `postgres_changes` sont typés génériquement par supabase-js (`Record<string, any>`) — on caste
// explicitement, comme le fait déjà `conversations/inbox.tsx`.
type OrderRow = {
  id: string
  order_number: number
  total: number
  mode: string
  arrived_at: string | null
  arrival_note: string | null
}

type OrderContent = { code: string; amount: number }
type ArrivalContent = { code: string; note: string | null }

export function LiveAlertOverlay({ restaurantId }: { restaurantId: string }) {
  const [orderData, setOrderData] = useState<OrderContent | null>(null)
  const [arrivalData, setArrivalData] = useState<ArrivalContent | null>(null)

  const seenRef = useRef<Set<string>>(new Set())
  const orderElRef = useRef<HTMLDivElement | null>(null)
  const arrivalElRef = useRef<HTMLDivElement | null>(null)
  const orderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const arrivalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Débloque l'audio au tout premier geste utilisateur sur la page (contrainte navigateur :
  // un AudioContext démarre suspendu tant qu'aucun geste n'a eu lieu). Pas de bascule 🔔 (choix produit) :
  // une commande arrivant avant le 1er clic affiche l'overlay mais ne sonne pas, assumé.
  useEffect(() => {
    document.addEventListener('click', ensureAudio)
    return () => document.removeEventListener('click', ensureAudio)
  }, [])

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const channel = supabase
      .channel(`live-alert-${restaurantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, (payload) => {
        if (payload.eventType !== 'INSERT' && payload.eventType !== 'UPDATE') return
        const row = payload.new as OrderRow
        const oldRow = payload.old as Partial<OrderRow> | undefined
        const evt = decideAlert(
          { type: payload.eventType, row, oldArrivedAt: oldRow?.arrived_at },
          seenRef.current,
        )
        if (!evt) return
        if (evt.kind === 'order') openOrder({ code: evt.code, amount: evt.amount })
        else openArrival({ code: evt.code, note: evt.note })
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId])

  // Nettoyage à jamais au démontage : timers + carillon en cours.
  useEffect(() => () => {
    if (orderTimerRef.current) clearTimeout(orderTimerRef.current)
    if (arrivalTimerRef.current) clearTimeout(arrivalTimerRef.current)
    stopAlert()
  }, [])

  /** Retire puis réajoute la classe `on` avec un reflow forcé entre les deux, pour réarmer
   *  l'apparition si un 2e événement arrive pendant que l'overlay est déjà affiché. */
  function arm(el: HTMLDivElement | null) {
    if (!el) return
    el.classList.remove('on')
    void el.offsetWidth
    el.classList.add('on')
  }

  function openOrder(content: OrderContent) {
    setOrderData(content)
    arm(orderElRef.current)
    startAlert()
    if (orderTimerRef.current) clearTimeout(orderTimerRef.current)
    orderTimerRef.current = setTimeout(closeOrder, ORDER_AUTO_CLOSE_MS)
  }

  function openArrival(content: ArrivalContent) {
    setArrivalData(content)
    arm(arrivalElRef.current)
    startAlert()
    if (arrivalTimerRef.current) clearTimeout(arrivalTimerRef.current)
    arrivalTimerRef.current = setTimeout(closeArrival, ARRIVAL_AUTO_CLOSE_MS)
  }

  function closeOrder() {
    orderElRef.current?.classList.remove('on')
    if (orderTimerRef.current) { clearTimeout(orderTimerRef.current); orderTimerRef.current = null }
    stopAlert()
  }

  function closeArrival() {
    arrivalElRef.current?.classList.remove('on')
    if (arrivalTimerRef.current) { clearTimeout(arrivalTimerRef.current); arrivalTimerRef.current = null }
    stopAlert()
  }

  return (
    <>
      {/* Nouvelle commande — toujours monté, caché par défaut (classe `on` pilotée impérativement). */}
      <div
        ref={orderElRef}
        role="alert"
        aria-live="assertive"
        onClick={closeOrder}
        className="live-alert-overlay fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-tint-mint px-6 text-center print:hidden"
      >
        {orderData && (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-foreground/70">
              Nouvelle commande
            </p>
            <p className="font-display text-7xl font-black leading-none text-foreground sm:text-9xl">
              #{orderData.code}
            </p>
            <p className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              {formatFcfa(orderData.amount)}
            </p>
            <p className="mt-6 text-sm font-medium text-foreground/70">Toucher pour fermer</p>
          </>
        )}
      </div>

      {/* Client arrivé (Drive) — même mécanique, teinte sky. */}
      <div
        ref={arrivalElRef}
        role="alert"
        aria-live="assertive"
        onClick={closeArrival}
        className="live-alert-overlay fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-tint-sky px-6 text-center print:hidden"
      >
        {arrivalData && (
          <>
            <p className="text-sm font-semibold uppercase tracking-[0.3em] text-foreground/70">
              Client arrivé — à remettre
            </p>
            <p className="font-display text-7xl font-black leading-none text-foreground sm:text-9xl">
              #{arrivalData.code}
            </p>
            {arrivalData.note && (
              <p className="max-w-md text-lg font-medium text-foreground/80">{arrivalData.note}</p>
            )}
            <p className="mt-6 text-sm font-medium text-foreground/70">Toucher pour fermer</p>
          </>
        )}
      </div>
    </>
  )
}
