import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClientRow } from '@/lib/clients'

/** Une ligne de `clients_summary` (migration 20260720000040). */
interface SummaryRow {
  customer_id: string
  orders_count: number | string
  ltv: number | string
  last_order_at: string | null
  avg_basket: number | string
  favorite_item: string | null
}

/**
 * Charge les clients d'un restaurant et leurs agrégats CRM (LTV, nb commandes, panier moyen,
 * dernière commande, plat préféré).
 *
 * L'agrégation est faite EN SQL par la fonction `clients_summary` (une ligne par client) : la v1
 * chargeait toutes les commandes du resto depuis l'origine + `order_items` joints pour agréger en
 * JS (`lib/clients.ts::buildClients`), ce qui faisait des dizaines de milliers de lignes à chaque
 * affichage. `buildClients` reste la référence des règles métier (et reste testé) ; `clients_summary`
 * les reproduit à l'identique — seul le départage d'égalité du plat préféré diffère (nom croissant
 * côté SQL, ordre d'insertion côté JS), cf. commentaire de la migration.
 *
 * Sécurité : `customers` est protégé par la RLS tenant ; `clients_summary` est `security definer` et
 * vérifie `is_member(p_restaurant_id)`. Pas de pagination v1 (tri LTV décroissante ici).
 */
export async function getClients(supabase: SupabaseClient, restaurantId: string): Promise<ClientRow[]> {
  const [customersRes, summaryRes] = await Promise.all([
    supabase
      .from('customers')
      .select('id, name, phone, marketing_opt_in, opted_out, created_at, notes')
      .eq('restaurant_id', restaurantId),
    supabase.rpc('clients_summary', { p_restaurant_id: restaurantId }),
  ])

  const summaryByCustomer = new Map<string, SummaryRow>()
  for (const s of (summaryRes.data ?? []) as SummaryRow[]) {
    summaryByCustomer.set(s.customer_id, s)
  }

  const rows: ClientRow[] = (customersRes.data ?? []).map((c) => {
    const s = summaryByCustomer.get(c.id as string)
    return {
      id: c.id as string,
      name: (c.name as string | null) ?? null,
      phone: c.phone as string,
      ordersCount: Number(s?.orders_count ?? 0),
      ltv: Number(s?.ltv ?? 0),
      lastOrderAt: s?.last_order_at ?? null,
      avgBasket: Number(s?.avg_basket ?? 0),
      favoriteItem: s?.favorite_item ?? null,
      marketingOptIn: !!c.marketing_opt_in,
      optedOut: !!c.opted_out,
      createdAt: c.created_at as string,
      notes: (c.notes as string | null) ?? null,
    }
  })

  return rows.sort((a, b) => b.ltv - a.ltv)
}
