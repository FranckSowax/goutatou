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
 * Confirme la réception d'un paiement Airtel Money (« Paiement reçu ✓ »). Garde MEMBRE du resto
 * (pas owner-only : un employé caissier valide aussi) ; l'update passe par le client Supabase
 * authentifié (policy `tenant_all_orders` for all). Le filtre `payment_status='a_verifier'` rend
 * l'action idempotente (double-clic ou deux onglets → un seul UPDATE effectif) ; c'est cet UPDATE
 * Realtime qui déclenche l'alerte cuisine web et, côté bot, le ticket groupe + message client.
 */
export async function confirmPayment(orderId: string) {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Non authentifié.')
  const { data: member } = await supabase
    .from('restaurant_members')
    .select('restaurant_id')
    .limit(1)
    .maybeSingle()
  if (!member) throw new Error('Aucun restaurant associé à ce compte.')

  const { error } = await supabase
    .from('orders')
    .update({
      payment_status: 'paye',
      paid_at: new Date().toISOString(),
      paid_confirmed_by: user.id,
    })
    .eq('id', orderId)
    .eq('restaurant_id', member.restaurant_id)
    .eq('payment_status', 'a_verifier')
  if (error) throw new Error(`Confirmation impossible : ${error.message}`)
  revalidatePath('/app/commandes')
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
