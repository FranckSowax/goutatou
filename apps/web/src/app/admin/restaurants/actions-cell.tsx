'use client'

import type { ReactNode } from 'react'
import { TableCell } from '@/components/ui/table'

/**
 * Cellule d'actions cliquable sans déclencher la navigation de la ligne
 * (RestaurantRow). Le stopPropagation doit vivre côté client : un onClick posé
 * depuis un Server Component ne se sérialise pas (crash RSC en prod).
 */
export function ActionsCell({ children }: { children: ReactNode }) {
  return (
    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
      {children}
    </TableCell>
  )
}
