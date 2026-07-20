import { createSupabaseServer } from '@/lib/supabase/server'
import { dayBoundsUtc, formatYmdLibreville } from '@/lib/order-day'
import { DeliveryBoard, type DeliveryRow, type ActiveLivreur } from './board'

export const dynamic = 'force-dynamic'

type RawDelivery = {
  id: string
  dispatch_state: DeliveryRow['dispatch_state']
  assigned_at: string | null
  delivered_at: string | null
  created_at: string
  livreur: { id: string; name: string; phone: string } | null
  orders: {
    order_number: number
    total: number
    delivery_address: string | null
    created_at: string
    verified_at: string | null
    customers: { name: string | null; phone: string } | null
    order_items: { name: string; qty: number }[] | null
  } | null
}

export default async function LivraisonPage() {
  const supabase = await createSupabaseServer()
  const { data: member } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).maybeSingle()
  if (!member) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center text-muted-foreground">
        Aucun restaurant associé à votre compte pour le moment.
      </div>
    )
  }
  const restaurantId = member.restaurant_id

  // Fenêtre bornée (perf) : les livraisons du jour civil courant (Libreville) + TOUTES celles encore
  // actives (à attribuer / en cours), même créées un jour précédent — elles ne doivent jamais
  // disparaître du board. La colonne « Livrées » ne montre donc que la journée en cours.
  const { startUtc, endUtc } = dayBoundsUtc(formatYmdLibreville(new Date()))
  const { data: raw } = await supabase
    .from('deliveries')
    .select(
      `id, dispatch_state, assigned_at, delivered_at, created_at,
       livreur:livreurs(id, name, phone),
       orders(order_number, total, delivery_address, created_at, verified_at,
              customers(name, phone), order_items(name, qty))`,
    )
    .eq('restaurant_id', restaurantId)
    .or(`and(created_at.gte.${startUtc},created_at.lt.${endUtc}),dispatch_state.in.(pending,assigned)`)
    .order('created_at', { ascending: false })
    .limit(300)

  const { data: livreurs } = await supabase
    .from('livreurs')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .eq('active', true)
    .order('name')

  const rows: DeliveryRow[] = ((raw as unknown as RawDelivery[]) ?? [])
    .filter((d) => d.orders != null)
    .map((d) => ({
      id: d.id,
      dispatch_state: d.dispatch_state,
      livreur: d.livreur ? { id: d.livreur.id, name: d.livreur.name, phone: d.livreur.phone } : null,
      order: {
        order_number: d.orders!.order_number,
        total: d.orders!.total,
        delivery_address: d.orders!.delivery_address,
        created_at: d.orders!.created_at,
        verified_at: d.orders!.verified_at,
        customer_name: d.orders!.customers?.name ?? null,
        customer_phone: d.orders!.customers?.phone ?? '',
        items: d.orders!.order_items ?? [],
      },
    }))

  const activeLivreurs: ActiveLivreur[] = (livreurs ?? []).map((l) => ({ id: l.id, name: l.name }))

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-2xl font-semibold">Livraison</h1>
      <DeliveryBoard rows={rows} livreurs={activeLivreurs} />
    </div>
  )
}
