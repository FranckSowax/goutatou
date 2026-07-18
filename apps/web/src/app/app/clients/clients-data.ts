import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { buildClients, type ClientRow, type RawCustomer, type RawOrder } from '@/lib/clients'

/**
 * Charge les clients d'un restaurant et leurs agrégats CRM (LTV, nb commandes, panier moyen,
 * dernière commande, plat préféré) via `buildClients`. RLS tenant sur `customers`/`orders` : le
 * client authentifié ne voit que les lignes de son restaurant. Pas de pagination v1 (tri LTV desc
 * assuré par `buildClients`).
 */
export async function getClients(supabase: SupabaseClient, restaurantId: string): Promise<ClientRow[]> {
  const [customersRes, ordersRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone, marketing_opt_in, opted_out, created_at, notes')
      .eq('restaurant_id', restaurantId),
    supabase
      .from('orders')
      .select('customer_id, total, status, created_at, order_items(name, qty)')
      .eq('restaurant_id', restaurantId),
  ])

  const customers: RawCustomer[] = (customersRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: (c.name as string | null) ?? null,
    phone: c.phone as string,
    marketing_opt_in: !!c.marketing_opt_in,
    opted_out: !!c.opted_out,
    created_at: c.created_at as string,
    notes: (c.notes as string | null) ?? null,
  }))

  const orders: RawOrder[] = (ordersRes.data ?? [])
    .filter((o) => o.customer_id != null)
    .map((o) => ({
      customer_id: o.customer_id as string,
      total: Number(o.total ?? 0),
      status: (o.status as string) ?? '',
      created_at: o.created_at as string,
      items: Array.isArray(o.order_items)
        ? (o.order_items as { name: string; qty: number }[]).map((it) => ({
            name: it.name,
            qty: Number(it.qty ?? 0),
          }))
        : [],
    }))

  return buildClients(customers, orders)
}
