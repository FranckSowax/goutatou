'use server'
import { revalidatePath } from 'next/cache'
import { createSupabaseServer } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeGabonPhone } from '@/lib/lp/wa'

async function myRestaurantId(): Promise<string> {
  const supabase = await createSupabaseServer()
  const { data, error } = await supabase.from('restaurant_members').select('restaurant_id').limit(1).single()
  if (error || !data) throw new Error('Aucun restaurant associé à ce compte')
  return data.restaurant_id as string
}

type CreateOrderItem = { menu_item_id: string; qty: number; supplement_ids?: string[] }

/**
 * Crée une commande comptoir (POS4). `items` = JSON de `toCreateOrderItems(cart)` — le POS
 * n'envoie jamais de prix, `create_order` reste la seule source de vérité du total.
 *
 * Client : un numéro (optionnel) donne un vrai client `customers` (marketing opt-in, comme la LP) ;
 * sans numéro, la commande est rattachée au client « Comptoir » (opt-out, jamais marketé/routable).
 * Écritures via le client admin (service_role) : `create_order` est réservé au service_role
 * (migration 0015/0005) et l'upsert `customers` suit le même pattern que la route LP.
 */
export async function createCounterOrder(formData: FormData): Promise<{ orderId: string }> {
  const restaurantId = await myRestaurantId()

  let items: CreateOrderItem[]
  try {
    items = JSON.parse(String(formData.get('items') ?? '[]'))
  } catch {
    throw new Error('Panier invalide.')
  }
  if (!Array.isArray(items) || items.length === 0) throw new Error('Panier vide.')

  const phone = String(formData.get('phone') ?? '').trim()
  const admin = createAdminClient()

  let customerId: string
  if (phone) {
    const normalized = normalizeGabonPhone(phone)
    if (!normalized) throw new Error('Numéro invalide.')
    const { data: customer, error: custErr } = await admin
      .from('customers')
      .upsert(
        {
          restaurant_id: restaurantId,
          phone: normalized,
          chat_id: `${normalized}@s.whatsapp.net`,
          marketing_opt_in: true,
          opted_out: false,
        },
        { onConflict: 'restaurant_id,phone' },
      )
      .select('id')
      .single()
    if (custErr || !customer) throw new Error('Erreur interne.')
    customerId = customer.id
  } else {
    const { data: customer, error: custErr } = await admin
      .from('customers')
      .upsert(
        {
          restaurant_id: restaurantId,
          phone: 'comptoir',
          chat_id: 'comptoir',
          name: 'Comptoir',
          marketing_opt_in: false,
          opted_out: true,
        },
        { onConflict: 'restaurant_id,phone' },
      )
      .select('id')
      .single()
    if (custErr || !customer) throw new Error('Erreur interne.')
    customerId = customer.id
  }

  const { data, error } = await admin.rpc('create_order', {
    p_restaurant_id: restaurantId,
    p_customer_id: customerId,
    p_source: 'comptoir',
    p_mode: 'sur_place',
    p_items: items,
    p_drive_slot_id: null,
    p_delivery_address: null,
  })
  if (error || !data?.[0]) {
    console.error('[pos] create_order', error)
    throw new Error('Commande impossible (plats indisponibles ?).')
  }

  revalidatePath('/app/commandes')
  return { orderId: (data[0] as { order_id: string }).order_id }
}
