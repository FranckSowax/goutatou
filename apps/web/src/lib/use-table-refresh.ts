'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

/**
 * Abonnement Realtime « rafraîchir la page » — mutualisé (lot C2).
 *
 * Pourquoi ce hook plutôt qu'un `supabase.channel(...).on(..., () => router.refresh())` copié
 * dans chaque board :
 *  - **debounce** : une rafale d'events (une commande touche `orders` puis `deliveries`, un worker
 *    met à jour 20 destinataires de campagne…) ne déclenche plus 20 rendus serveur complets des
 *    pages `force-dynamic`, mais un seul, `debounceMs` après le dernier event ;
 *  - **filtre tenant** : `restaurant_id=eq.<id>` est posé sur chaque table, comme le font déjà
 *    `live-alert-overlay.tsx` et `conversations/inbox.tsx`. Sans lui, un board se réveille sur
 *    l'activité d'un autre restaurant (la ligne reste invisible grâce à RLS, mais le rendu, lui,
 *    est bien payé) ;
 *  - **un seul canal** pour N tables (le board livraison en ouvrait deux, d'où 2 refresh pour une
 *    même livraison).
 *
 * Ce hook ne convient QU'AUX abonnements « je me refais rendre » : les consommateurs qui ont
 * besoin du payload (alerte cuisine, cloche de notifications) gardent leur propre abonnement.
 */

/** Sous-ensemble du client Supabase utilisé ici — permet un faux client dans les tests. */
export interface RealtimeChannelLike {
  on(event: 'postgres_changes', filter: Record<string, unknown>, callback: () => void): RealtimeChannelLike
  subscribe(): RealtimeChannelLike
}

export interface RealtimeClientLike {
  channel(name: string): RealtimeChannelLike
  removeChannel(channel: RealtimeChannelLike): unknown
}

export interface TableRefreshInput {
  client: RealtimeClientLike
  /** Nom de base du canal — doit rester unique dans l'app (le client navigateur est un singleton). */
  channelName: string
  tables: readonly string[]
  /** Tenant courant ; quand il est fourni, chaque table est filtrée sur `restaurant_id`. */
  restaurantId?: string | null
  debounceMs?: number
  onRefresh: () => void
}

/**
 * Cœur testable (sans React) : ouvre le canal, debounce les events, renvoie le nettoyage.
 * Le nettoyage annule le timer en vol *avant* de retirer le canal — pas de `router.refresh()`
 * sur un composant démonté.
 */
export function subscribeTableRefresh({
  client,
  channelName,
  tables,
  restaurantId,
  debounceMs = 500,
  onRefresh,
}: TableRefreshInput): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onRefresh()
    }, debounceMs)
  }

  let channel = client.channel(restaurantId ? `${channelName}-${restaurantId}` : channelName)
  for (const table of tables) {
    channel = channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        ...(restaurantId ? { filter: `restaurant_id=eq.${restaurantId}` } : {}),
      },
      schedule,
    )
  }
  channel.subscribe()

  return () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    void client.removeChannel(channel)
  }
}

export interface UseTableRefreshOptions {
  channelName: string
  tables: readonly string[]
  restaurantId?: string | null
  debounceMs?: number
}

/** Version React du hook — `router.refresh()` debouncé sur les tables données. */
export function useTableRefresh({ channelName, tables, restaurantId, debounceMs = 500 }: UseTableRefreshOptions): void {
  const router = useRouter()
  // `tables` est presque toujours un littéral : on dépend de sa valeur, pas de son identité.
  const tablesKey = tables.join(',')

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    return subscribeTableRefresh({
      client: supabase as unknown as RealtimeClientLike,
      channelName,
      tables: tablesKey.split(','),
      restaurantId,
      debounceMs,
      onRefresh: () => router.refresh(),
    })
  }, [router, channelName, tablesKey, restaurantId, debounceMs])
}
