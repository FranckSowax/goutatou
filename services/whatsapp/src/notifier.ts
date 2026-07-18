import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken, formatFcfa, type OrderMode, type OrderStatus } from '@goutatou/db'
import { signWheelToken } from '@goutatou/db/wheel'
import { signLoyaltyToken } from '@goutatou/db/loyalty'
import { shouldOfferSpin } from '@goutatou/db/types'
import { WhapiClient } from '@goutatou/whapi'
import { buildWheelLink, wheelMessage, wheelMessageBody } from './loyalty/trigger.js'
import { buildCardLink, cardMessage, cardMessageBody } from './loyalty/card-trigger.js'

export interface OrderRow {
  id: string
  restaurant_id: string
  customer_id: string
  order_number: number
  status: OrderStatus
  mode: OrderMode
  // Présents sur la ligne réelle (INSERT/UPDATE realtime) mais optionnels ici pour ne pas
  // casser les littéraux OrderRow existants (tests handleOrderUpdate) qui ne les fournissent pas.
  total?: number
  delivery_address?: string | null
}

export interface OrderItemRow {
  name: string
  unit_price: number
  qty: number
}

export interface OrderCustomer {
  name: string | null
  phone: string
}

const MODE_LABELS_FR: Record<OrderMode, string> = {
  drive: 'Retrait',
  livraison: 'Livraison',
  sur_place: 'À emporter',
}

/**
 * Ticket FR posté au groupe Cuisine à la création d'une commande. Les lignes ↳ supplément
 * (order_items normaux, name préfixé '↳ ', triés par position) sortent naturellement dans
 * l'ordre et s'affichent sans le préfixe qty× — juste le name.
 */
export function buildStaffTicket(newRow: OrderRow, items: OrderItemRow[], customer: OrderCustomer): string {
  const modeLabel = MODE_LABELS_FR[newRow.mode] ?? newRow.mode
  const itemLines = items.map((it) => (it.name.startsWith('↳') ? it.name : `${it.qty}× ${it.name}`))
  const clientLine = `Client : ${customer.name ?? customer.phone}`
  const lines = [
    `🧾 *Commande #${newRow.order_number}* — ${modeLabel}`,
    ...itemLines,
    `Total : ${formatFcfa(newRow.total ?? 0)}`,
    clientLine,
  ]
  if (newRow.delivery_address) lines.push(newRow.delivery_address)
  return lines.join('\n')
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

// sendQuickReplies OPTIONNEL (contrairement à sendText/sendInteractiveUrl) : le bouton d'arrivée
// Drive est un ajout best-effort par-dessus le message de statut (cf. handleOrderUpdate), jamais
// une dépendance dure — un makeWhapi/mock qui ne le fournit pas continue de fonctionner (message
// de statut seul), même pattern que ProcessorWhapi dans processor.ts.
type MakeWhapi = (token: string) =>
  Pick<WhapiClient, 'sendText' | 'sendInteractiveUrl'> & Partial<Pick<WhapiClient, 'sendQuickReplies'>>
type Decrypt = (payload: string, keyHex: string) => string

/** Id du bouton d'arrivée Drive (cf. processor.ts handleArrivalButton, préfixe `arr:`). */
export const ARRIVAL_BUTTON_TITLE = '✅ Je suis arrivé'

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

    // Bouton d'arrivée Drive (« ✅ Je suis arrivé », id `arr:<orderId>`, cf. processor.ts
    // handleArrivalButton) : envoyé quand la commande passe `prete`, EN PLUS du message de statut
    // ci-dessus (jamais à sa place). Choix du jalon : pour un Drive (mode 'Retrait'), le message
    // `prete` demande déjà au client de « se présenter au point drive » — c'est le moment où le
    // signal d'arrivée devient actionnable côté cuisine (l'overlay « CLIENT ARRIVÉ — À REMETTRE »
    // n'a de sens QUE si la commande est prête à être remise). L'envoyer plus tôt (à la création)
    // ferait apparaître un bouton avant que la commande soit prête à remettre, et un tap précoce
    // déclencherait une fausse urgence en cuisine pour un plat pas encore terminé. Best-effort :
    // un échec (ou un makeWhapi/mock sans sendQuickReplies) ne doit jamais empêcher le message de
    // statut, déjà envoyé ci-dessus.
    if (newRow.status === 'prete' && newRow.mode === 'drive') {
      try {
        if (whapiClient.sendQuickReplies) {
          await whapiClient.sendQuickReplies(
            customer.chat_id,
            'Prévenez-nous dès que vous êtes sur place :',
            [{ id: `arr:${newRow.id}`, title: ARRIVAL_BUTTON_TITLE }],
          )
        }
      } catch (err) {
        console.error(`[notifier] envoi bouton arrivée échoué commande ${newRow.id}`, err)
      }
    }

    if (newRow.status === 'recuperee' && wheelSecret && wheelBaseUrl) {
      const { data: resto } = await db.from('restaurants')
        .select('loyalty_enabled, wheel_enabled, wheel_trigger_orders, wheel_qr_public').eq('id', newRow.restaurant_id).single()

      // Carte de fidélité : quand elle est activée, elle REMPLACE la roue post-commande (la roue
      // reste inerte, wheel_enabled restant false côté resto). Envoi du lien carte à la 1ʳᵉ
      // commande récupérée du client (count === 1) — le même critère de comptage que la roue.
      // Pas de jti/anti-rejeu ici : le +1 en caisse est protégé côté SQL (cooldown atomique), et
      // le lien carte est permanent ; la garde count === 1 suffit à n'envoyer l'invitation qu'une fois.
      if (resto?.loyalty_enabled) {
        const { count } = await db.from('orders').select('id', { count: 'exact', head: true })
          .eq('restaurant_id', newRow.restaurant_id).eq('customer_id', newRow.customer_id).eq('status', 'recuperee')
        if (count === 1) {
          const token = signLoyaltyToken(
            { rid: newRow.restaurant_id, cid: newRow.customer_id }, wheelSecret, Math.floor(Date.now() / 1000))
          const link = buildCardLink(wheelBaseUrl, token)
          try {
            try {
              await whapiClient.sendInteractiveUrl(customer.chat_id, cardMessageBody(), '💳 Ma carte de fidélité', link)
            } catch {
              await whapiClient.sendText(customer.chat_id, cardMessage(link))
            }
          } catch (err) {
            console.error('[notifier] envoi carte fidélité échoué', err)
          }
        }
        return
      }

      // wheel_qr_public actif → la roue QR publique remplace le trigger post-commandes (cf. UI
      // admin « Remplacé par la roue QR ») : ne pas émettre ce jeton v2 (jti sans préfixe `qr:`),
      // il échapperait à la garde atomique de spin_wheel et bloquerait le client 30 j sur la roue QR.
      if (resto?.wheel_enabled && !resto.wheel_qr_public) {
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

/**
 * Ticket nouvelle commande au groupe Cuisine (best-effort, jamais bloquant). Silencieux
 * (aucun envoi, aucun log) quand le resto n'a pas de staff_group_id ou que le canal whapi
 * n'est pas actif ; toute autre erreur (requête DB, sendText) est capturée et loguée
 * `[staff-group]` sans jamais remonter — G1/handleOrderUpdate ne doivent pas en dépendre.
 */
export async function handleOrderInsert(
  db: SupabaseClient,
  tokenKey: string,
  newRow: OrderRow,
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendText'> = (token) => new WhapiClient(token),
  decrypt: Decrypt = decryptToken,
): Promise<void> {
  try {
    const { data: restaurant } = await db
      .from('restaurants').select('staff_group_id').eq('id', newRow.restaurant_id).single()
    if (!restaurant?.staff_group_id) return

    const { data: channel } = await db
      .from('whapi_channels').select('token_encrypted, status').eq('restaurant_id', newRow.restaurant_id).single()
    if (!channel || channel.status !== 'active') return

    const { data: items } = await db
      .from('order_items').select('name, unit_price, qty').eq('order_id', newRow.id).order('position')
    const { data: customer } = await db
      .from('customers').select('name, phone').eq('id', newRow.customer_id).single()

    const ticket = buildStaffTicket(newRow, items ?? [], customer ?? { name: null, phone: '' })
    const whapiClient = makeWhapi(decrypt(channel.token_encrypted, tokenKey))
    await whapiClient.sendText(restaurant.staff_group_id, ticket)
  } catch (err) {
    console.error(`[staff-group] envoi ticket échoué commande ${newRow.id}`, err)
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
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'orders' },
      (payload) => {
        handleOrderInsert(db, tokenKey, payload.new as OrderRow)
          .catch((err) => console.error('[staff-group]', err))
      },
    )
    .subscribe((status) => console.log(`[notifier] realtime: ${status}`))
}
