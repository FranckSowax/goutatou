'use client'

import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { TableRow } from '@/components/ui/table'

/**
 * Ligne de table cliquable → fiche restaurant. Les actions inline (formulaires,
 * liens) stoppent la propagation pour ne pas déclencher la navigation de ligne.
 */
export function RestaurantRow({ restaurantId, children }: { restaurantId: string; children: ReactNode }) {
  const router = useRouter()
  return (
    <TableRow
      onClick={() => router.push(`/admin/restaurants/${restaurantId}`)}
      className="cursor-pointer"
    >
      {children}
    </TableRow>
  )
}
