'use client'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * État « commandes en direct » partagé par la coquille /app : la cloche de l'en-tête ET le badge
 * « Commandes » de la nav. Un seul canal Realtime sur `orders` pour les deux (c'est l'ancien canal
 * de la cloche, désormais filtré par `restaurant_id` comme le fait déjà live-alert-overlay).
 *
 * - `pending` : nombre de commandes au statut `recue` (badge de nav). Semé par le serveur
 *   (`initialPending`, layout) puis ajusté à chaud ; toute nouvelle valeur serveur le resynchronise.
 * - `newSince` : commandes arrivées depuis l'ouverture de la page (cloche), remis à zéro au clic.
 */
interface OrdersLive {
  pending: number
  newSince: number
  clearNewSince: () => void
}

const OrdersLiveContext = createContext<OrdersLive>({ pending: 0, newSince: 0, clearNewSince: () => {} })

/** Compteur de commandes en attente (statut `recue`) — 0 hors du provider. */
export function usePendingOrdersCount(): number {
  return useContext(OrdersLiveContext).pending
}

interface OrderRow { status?: string }

export function OrdersLiveProvider({
  restaurantId,
  initialPending = 0,
  children,
}: {
  restaurantId?: string | null
  initialPending?: number
  children: ReactNode
}) {
  const [pending, setPending] = useState(initialPending)
  const [newSince, setNewSince] = useState(0)

  // Resynchronisation : chaque nouveau rendu serveur de la coquille (router.refresh d'un board)
  // fait autorité sur le comptage optimiste ci-dessous.
  useEffect(() => { setPending(initialPending) }, [initialPending])

  useEffect(() => {
    if (!restaurantId) return
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const bump = (delta: number) => setPending((c) => Math.max(0, c + delta))
    const channel = supabase
      .channel(`orders-live-${restaurantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'orders',
        filter: `restaurant_id=eq.${restaurantId}`,
      }, (payload) => {
        const next = payload.new as OrderRow | undefined
        const prev = payload.old as OrderRow | undefined
        if (payload.eventType === 'INSERT') {
          setNewSince((c) => c + 1)
          if (next?.status === 'recue') bump(1)
          return
        }
        if (payload.eventType === 'DELETE') {
          if (prev?.status === 'recue') bump(-1)
          return
        }
        // UPDATE : sans l'ancienne ligne (REPLICA IDENTITY), on ne peut pas déduire de delta —
        // on laisse le prochain rendu serveur faire autorité plutôt que de fausser le compteur.
        if (prev?.status === undefined) return
        if (prev.status === 'recue' && next?.status !== 'recue') bump(-1)
        else if (prev.status !== 'recue' && next?.status === 'recue') bump(1)
      })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [restaurantId])

  return (
    <OrdersLiveContext.Provider value={{ pending, newSince, clearNewSince: () => setNewSince(0) }}>
      {children}
    </OrdersLiveContext.Provider>
  )
}

export function NotificationsBell() {
  const router = useRouter()
  const { newSince, clearNewSince } = useContext(OrdersLiveContext)
  const count = newSince

  return (
    <Button
      variant="ghost"
      size="icon"
      className="relative"
      aria-label={count > 0 ? `${count} nouvelle${count > 1 ? 's' : ''} commande${count > 1 ? 's' : ''}` : 'Notifications'}
      onClick={() => {
        clearNewSince()
        router.push('/app/commandes')
      }}
    >
      <Bell className="size-4" />
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
          {count > 9 ? '9+' : count}
        </span>
      )}
    </Button>
  )
}
