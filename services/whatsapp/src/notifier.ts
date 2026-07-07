import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, type OrderMode, type OrderStatus } from '@goutatou/db'
import { WhapiClient } from '@goutatou/whapi'

export interface OrderRow {
  id: string
  restaurant_id: string
  customer_id: string
  order_number: number
  status: OrderStatus
  mode: OrderMode
}

export function statusMessage(status: OrderStatus, orderNumber: number, mode: OrderMode): string | null {
  switch (status) {
    case 'recue':
      return null // déjà confirmée à la création par le processor
    case 'en_preparation':
      return `👨‍🍳 Votre commande *n°${orderNumber}* est en préparation !`
    case 'prete':
      if (mode === 'drive') return `🚗 Votre commande *n°${orderNumber}* est prête ! Présentez-vous au point drive.`
      if (mode === 'livraison') return `🛵 Votre commande *n°${orderNumber}* est prête, le livreur arrive !`
      return `🍽️ Votre commande *n°${orderNumber}* est prête !`
    case 'recuperee':
      return `Merci et bon appétit ! 🙏 À très vite.`
    case 'annulee':
      return `❌ Votre commande *n°${orderNumber}* a été annulée. Contactez-nous pour toute question.`
  }
}

type MakeWhapi = (token: string) => Pick<WhapiClient, 'sendText'>
type Decrypt = (payload: string, keyHex: string) => string

export async function handleOrderUpdate(
  db: SupabaseClient,
  tokenKey: string,
  oldRow: OrderRow,
  newRow: OrderRow,
  makeWhapi: MakeWhapi = (token) => new WhapiClient(token),
  decrypt: Decrypt = decryptToken,
): Promise<void> {
  if (oldRow.status === newRow.status) return
  const message = statusMessage(newRow.status, newRow.order_number, newRow.mode)
  if (!message) return

  const { data: customer } = await db.from('customers').select('chat_id').eq('id', newRow.customer_id).single()
  const { data: channel } = await db
    .from('whapi_channels').select('token_encrypted, status').eq('restaurant_id', newRow.restaurant_id).single()
  if (!customer || !channel || channel.status !== 'active') return

  try {
    await makeWhapi(decrypt(channel.token_encrypted, tokenKey)).sendText(customer.chat_id, message)
  } catch (err) {
    console.error(`[notifier] envoi échoué commande ${newRow.id}`, err)
  }
}

export function startNotifier(db: SupabaseClient, tokenKey: string): void {
  db.channel('orders-status')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        handleOrderUpdate(db, tokenKey, payload.old as OrderRow, payload.new as OrderRow)
          .catch((err) => console.error('[notifier]', err))
      },
    )
    .subscribe((status) => console.log(`[notifier] realtime: ${status}`))
}
