import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, type OrderMode, type OrderStatus } from '@goutatou/db'
import { signWheelToken } from '@goutatou/db/wheel'
import { shouldOfferSpin } from '@goutatou/db/types'
import { WhapiClient } from '@goutatou/whapi'
import { buildWheelLink, wheelMessage, wheelMessageBody } from './loyalty/trigger.js'

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

type MakeWhapi = (token: string) => Pick<WhapiClient, 'sendText' | 'sendInteractiveUrl'>
type Decrypt = (payload: string, keyHex: string) => string

export async function handleOrderUpdate(
  db: SupabaseClient,
  tokenKey: string,
  oldRow: OrderRow,
  newRow: OrderRow,
  makeWhapi: MakeWhapi = (token) => new WhapiClient(token),
  decrypt: Decrypt = decryptToken,
  wheelSecret?: string,
  wheelBaseUrl?: string,
): Promise<void> {
  if (oldRow.status === newRow.status) return
  const message = statusMessage(newRow.status, newRow.order_number, newRow.mode)
  if (!message) return

  const { data: customer } = await db.from('customers').select('chat_id').eq('id', newRow.customer_id).single()
  const { data: channel } = await db
    .from('whapi_channels').select('token_encrypted, status').eq('restaurant_id', newRow.restaurant_id).single()
  if (!customer || !channel || channel.status !== 'active') return

  try {
    const whapiClient = makeWhapi(decrypt(channel.token_encrypted, tokenKey))
    await whapiClient.sendText(customer.chat_id, message)

    if (newRow.status === 'recuperee' && wheelSecret && wheelBaseUrl) {
      const { data: resto } = await db.from('restaurants')
        .select('wheel_enabled, wheel_trigger_orders').eq('id', newRow.restaurant_id).single()
      if (resto?.wheel_enabled) {
        const { count } = await db.from('orders').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', newRow.restaurant_id).eq('customer_id', newRow.customer_id).eq('status', 'recuperee')
        const { count: prizeCount } = await db.from('prizes').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', newRow.restaurant_id).eq('active', true).neq('stock', 0)
        if (shouldOfferSpin(count ?? 0, resto.wheel_trigger_orders) && (prizeCount ?? 0) > 0) {
          // jti déterministe (restaurant + client + jalon) : un doublon d'événement Realtime
          // ou un aller-retour de statut sur le même jalon régénère le MÊME jti, donc le
          // deuxième tour tombe sur already_spun (contrainte unique + verrou advisory en SQL).
          const token = signWheelToken(
            { rid: newRow.restaurant_id, cid: newRow.customer_id, jti: `${newRow.restaurant_id}:${newRow.customer_id}:${count}`, ttlSec: 72 * 3600 },
            wheelSecret, Math.floor(Date.now() / 1000))
          const link = buildWheelLink(wheelBaseUrl, token)
          try {
            // Bouton interactif d'abord (pattern cartelle congratulate) ; sur toute erreur (payload
            // instable, réseau…), fallback sendText BYTE-IDENTIQUE au message v1.
            try {
              await whapiClient.sendInteractiveUrl(customer.chat_id, wheelMessageBody(), '🎰 Tourner la roue', link)
            } catch {
              await whapiClient.sendText(customer.chat_id, wheelMessage(link))
            }
          } catch (err) {
            console.error('[notifier] envoi roue échoué', err)
          }
        }
      }
    }
  } catch (err) {
    console.error(`[notifier] envoi échoué commande ${newRow.id}`, err)
  }
}

export function startNotifier(
  db: SupabaseClient,
  tokenKey: string,
  wheelSecret?: string,
  wheelBaseUrl?: string,
): void {
  db.channel('orders-status')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'orders' },
      (payload) => {
        handleOrderUpdate(
          db, tokenKey, payload.old as OrderRow, payload.new as OrderRow,
          undefined, undefined, wheelSecret, wheelBaseUrl,
        ).catch((err) => console.error('[notifier]', err))
      },
    )
    .subscribe((status) => console.log(`[notifier] realtime: ${status}`))
}
