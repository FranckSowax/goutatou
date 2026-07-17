'use server'
import { revalidatePath } from 'next/cache'
import type { OrderStatus } from '@goutatou/db'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase
    .from('orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', orderId)
  if (error) throw new Error(`Mise à jour impossible : ${error.message}`)
  revalidatePath('/app/commandes')
}

export async function cancelOrder(orderId: string) {
  return updateOrderStatus(orderId, 'annulee')
}

/**
 * Vérification humaine d'une commande (le resto a appelé/contacté le client et confirme qu'elle est
 * réelle). Pose ou retire `verified_at` — indépendant du statut Kanban. Idempotent.
 */
export async function verifyOrder(orderId: string, verified: boolean) {
  const supabase = await createSupabaseServer()
  const { error } = await supabase
    .from('orders')
    .update({ verified_at: verified ? new Date().toISOString() : null })
    .eq('id', orderId)
  if (error) throw new Error(`Vérification impossible : ${error.message}`)
  revalidatePath('/app/commandes')
}
