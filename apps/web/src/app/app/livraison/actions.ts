'use server'
import { revalidatePath } from 'next/cache'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createSupabaseServer } from '@/lib/supabase/server'
import { deliveryLinks, buildDeliveryMessage } from '@/lib/delivery'
import { requireMember } from '@/lib/member'

/** Garde membre (employé compris) — résolution unifiée via `lib/member.ts`. */
async function myRestaurantId(): Promise<string> {
  const supabase = await createSupabaseServer()
  const { restaurantId } = await requireMember(supabase)
  return restaurantId
}

/**
 * Attribue une livraison à un livreur et lui envoie par WhatsApp le détail de la commande + un
 * itinéraire Google Maps/Waze vers le client. Best-effort sur l'envoi : l'état d'attribution est
 * écrit MÊME si Whapi échoue (canal déconnecté → 401), pour ne pas bloquer l'organisation du resto.
 * Renvoie `{ ok:false, error }` si seul l'envoi a échoué (l'attribution, elle, est enregistrée).
 */
export async function assignDelivery(
  deliveryId: string,
  livreurId: string,
): Promise<{ ok: boolean; error?: string }> {
  const restaurantId = await myRestaurantId()
  const supabase = await createSupabaseServer()

  // Charge la livraison + commande + client (RLS restreint au resto du membre).
  const { data: delivery, error: dErr } = await supabase
    .from('deliveries')
    .select(
      `id, restaurant_id,
       orders(order_number, total, delivery_address, customers(name, phone))`,
    )
    .eq('id', deliveryId)
    .single()
  if (dErr || !delivery || delivery.restaurant_id !== restaurantId) throw new Error('Livraison introuvable.')

  const order = delivery.orders as unknown as {
    order_number: number
    total: number
    delivery_address: string | null
    customers: { name: string | null; phone: string } | null
  } | null
  if (!order) throw new Error('Commande introuvable.')

  const { data: livreur, error: lErr } = await supabase
    .from('livreurs')
    .select('id, name, phone')
    .eq('id', livreurId)
    .eq('restaurant_id', restaurantId)
    .single()
  if (lErr || !livreur) throw new Error('Livreur introuvable.')

  // Articles de la commande (nom + qté) pour le message livreur.
  const { data: items } = await supabase
    .from('deliveries')
    .select('orders(order_items(name, qty))')
    .eq('id', deliveryId)
    .single()
  const orderItems =
    ((items?.orders as unknown as { order_items: { name: string; qty: number }[] } | null)?.order_items) ?? []

  const { data: resto } = await supabase
    .from('restaurants')
    .select('location_lat, location_lng')
    .eq('id', restaurantId)
    .single()
  const gps =
    resto?.location_lat != null && resto?.location_lng != null
      ? { lat: resto.location_lat, lng: resto.location_lng }
      : null

  // Attribution : TOUJOURS écrite, même si l'envoi échoue ensuite.
  const { error: upErr } = await supabase
    .from('deliveries')
    .update({ livreur_id: livreurId, dispatch_state: 'assigned', assigned_at: new Date().toISOString() })
    .eq('id', deliveryId)
  if (upErr) throw new Error('Attribution impossible.')

  revalidatePath('/app/livraison')

  // Envoi WhatsApp au livreur — best-effort.
  try {
    const { data: channel } = await supabase
      .from('whapi_channels')
      .select('token_encrypted')
      .eq('restaurant_id', restaurantId)
      .maybeSingle()
    if (!channel) return { ok: false, error: 'Livreur assigné. Connectez un canal WhatsApp pour l’envoi automatique.' }

    const token = decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!)
    const links = deliveryLinks(order.delivery_address ?? '', gps)
    const message = buildDeliveryMessage(
      {
        order_number: order.order_number,
        customer_name: order.customers?.name ?? null,
        customer_phone: order.customers?.phone ?? '',
        delivery_address: order.delivery_address,
        total: order.total,
        items: orderItems,
      },
      links,
    )
    const digits = livreur.phone.replace(/\D/g, '')
    await new WhapiClient(token).sendText(`${digits}@s.whatsapp.net`, message)
    return { ok: true }
  } catch {
    return { ok: false, error: 'Livreur assigné, mais l’envoi WhatsApp a échoué (canal déconnecté ?).' }
  }
}

export async function markDelivered(deliveryId: string): Promise<void> {
  const restaurantId = await myRestaurantId()
  const supabase = await createSupabaseServer()
  const { error } = await supabase
    .from('deliveries')
    .update({ dispatch_state: 'delivered', delivered_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .eq('restaurant_id', restaurantId)
  if (error) throw new Error('Mise à jour impossible.')
  revalidatePath('/app/livraison')
}
