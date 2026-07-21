'use client'
import { useTableRefresh } from '@/lib/use-table-refresh'

/**
 * Rafraîchit silencieusement la page Accueil quand une commande du restaurant change.
 * Abonnement mutualisé (canal unique, refresh debouncé, filtre tenant) :
 * cf. `src/lib/use-table-refresh.ts`.
 */
export function HomeRefresh({ restaurantId }: { restaurantId: string }) {
  useTableRefresh({ channelName: 'home-refresh', tables: ['orders'], restaurantId })
  return null
}
