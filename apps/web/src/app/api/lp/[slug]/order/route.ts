import { NextResponse } from 'next/server'
import { formatFcfa } from '@goutatou/db/types'
import { decryptToken } from '@goutatou/db/crypto'
import { WhapiClient } from '@goutatou/whapi'
import { createAdminClient } from '@/lib/supabase/admin'
import { parseLpConfig } from '@/lib/lp/config'
import { validateWebOrder } from '@/lib/lp/order-validation'

export const runtime = 'nodejs'

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const body = await req.json().catch(() => null)
  const v = validateWebOrder(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
  const p = v.payload

  const db = createAdminClient()
  const { data: resto } = await db
    .from('restaurants')
    .select('id, name, lp_config, drive_enabled, whapi_channels(token_encrypted, status)')
    .eq('slug', slug)
    .maybeSingle()
  if (!resto || !parseLpConfig(resto.lp_config, resto.name).published) {
    return NextResponse.json({ error: 'Restaurant introuvable.' }, { status: 404 })
  }
  if (p.mode === 'drive') {
    if (!resto.drive_enabled) return NextResponse.json({ error: 'Le drive est indisponible.' }, { status: 400 })
    const { data: slot } = await db.from('drive_slots').select('id')
      .eq('id', p.driveSlotId!).eq('restaurant_id', resto.id).eq('active', true).maybeSingle()
    if (!slot) return NextResponse.json({ error: 'Créneau invalide.' }, { status: 400 })
  }

  const chatId = `${p.phone}@s.whatsapp.net`
  const { data: customer, error: custErr } = await db
    .from('customers')
    .upsert(
      { restaurant_id: resto.id, phone: p.phone, chat_id: chatId, name: p.customerName },
      { onConflict: 'restaurant_id,phone' },
    )
    .select('id')
    .single()
  if (custErr || !customer) return NextResponse.json({ error: 'Erreur interne.' }, { status: 500 })

  const { data: order, error: orderErr } = await db.rpc('create_order', {
    p_restaurant_id: resto.id,
    p_customer_id: customer.id,
    p_source: 'web',
    p_mode: p.mode,
    p_items: p.items.map((i) => ({ menu_item_id: i.menuItemId, qty: i.qty })),
    p_drive_slot_id: p.driveSlotId ?? null,
    p_delivery_address: p.address ?? null,
  })
  if (orderErr || !order?.[0]) {
    console.error('[lp-order] create_order', orderErr)
    return NextResponse.json({ error: 'Commande impossible (plats indisponibles ?).' }, { status: 500 })
  }
  const { order_number: orderNumber, total } = order[0] as { order_number: number; total: number }

  // Confirmation WhatsApp best-effort : l'échec n'annule pas la commande.
  const channel = resto.whapi_channels as unknown as { token_encrypted: string; status: string } | null
  if (channel?.status === 'active') {
    try {
      const whapi = new WhapiClient(decryptToken(channel.token_encrypted, process.env.TOKEN_ENCRYPTION_KEY!))
      await whapi.sendText(chatId,
        `✅ ${p.customerName}, votre commande *n°${orderNumber}* chez ${resto.name} est confirmée !\n` +
        `Total à régler à la remise : *${formatFcfa(total)}*\n\n` +
        `Nous vous préviendrons ici à chaque étape. 🙏`)
    } catch (err) {
      console.error('[lp-order] confirmation WhatsApp échouée', err)
    }
  }

  return NextResponse.json({ orderNumber, total })
}
