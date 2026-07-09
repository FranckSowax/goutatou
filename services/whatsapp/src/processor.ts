import { EMPTY_CART, formatFcfa } from '@goutatou/db'
import type { WhapiClient } from '@goutatou/whapi'
import { transition } from './bot/machine.js'
import { isOptOutKeyword } from './campaigns/optout.js'
import type { BotRepo } from './repo.js'

interface WhapiMessage {
  id: string
  from_me: boolean
  type: string
  chat_id: string
  from: string
  from_name?: string
  text?: { body?: string }
}

function orderConfirmedCopy(orderNumber: number, total: number, cart: {
  mode?: string; driveSlotLabel?: string; address?: string
}): string {
  const detail =
    cart.mode === 'drive' ? `\n🚗 Retrait drive — créneau ${cart.driveSlotLabel}` :
    cart.mode === 'livraison' ? `\n🛵 Livraison — ${cart.address}` : ''
  return (
    `✅ Commande *n°${orderNumber}* confirmée !${detail}\n` +
    `Total à régler à la remise : *${formatFcfa(total)}*\n\n` +
    `Nous vous préviendrons ici à chaque étape. Merci ! 🙏`
  )
}

export function createProcessor(
  repo: BotRepo,
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendText'>,
): (channelUuid: string, payload: unknown) => Promise<void> {
  return async (channelUuid, payload) => {
    const messages = (payload as { messages?: WhapiMessage[] })?.messages ?? []
    if (!messages.length) return

    const channel = await repo.getChannel(channelUuid)
    if (!channel) {
      console.warn(`[processor] canal inconnu ou inactif : ${channelUuid}`)
      return
    }
    const whapi = makeWhapi(channel.token)

    for (const msg of messages) {
      if (msg.from_me || msg.type !== 'text' || !msg.text?.body) continue

      // Idempotence : si ce message Whapi a déjà été loggé, on skip.
      const fresh = await repo.logMessage(channel.restaurantId, 'in', msg.chat_id, msg.text.body, msg.id)
      if (!fresh) continue

      try {
        const customer = await repo.upsertCustomer(channel.restaurantId, msg.from, msg.chat_id, msg.from_name)

        if (isOptOutKeyword(msg.text.body)) {
          await repo.setOptedOut(channel.restaurantId, customer.id)
          const bye = 'Vous êtes désabonné(e) des messages de ce restaurant. Tapez *menu* pour commander à nouveau quand vous voulez. 👋'
          try {
            const sent = await whapi.sendText(msg.chat_id, bye)
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, bye, sent.id)
          } catch (err) {
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, bye, undefined, String(err))
          }
          continue
        }

        const conv = await repo.loadConversation(channel.restaurantId, customer.id)
        const ctx = await repo.getBotContext(channel.restaurantId, channel.restaurantName, channel.driveEnabled)

        const res = transition(conv.state, conv.cart, msg.text.body, ctx)
        const replies = [...res.replies]
        let nextCart = res.cart

        if (res.createOrder) {
          const order = await repo.createOrder(channel.restaurantId, customer.id, res.cart)
          replies.push(orderConfirmedCopy(order.orderNumber, order.total, res.cart))
          nextCart = EMPTY_CART
        }

        await repo.saveConversation(channel.restaurantId, customer.id, res.state, nextCart)

        for (const reply of replies) {
          try {
            const sent = await whapi.sendText(msg.chat_id, reply)
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, reply, sent.id)
          } catch (err) {
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, reply, undefined, String(err))
          }
        }
      } catch (err) {
        console.error(`[processor] erreur message ${msg.id}`, err)
        try {
          await whapi.sendText(msg.chat_id, 'Oups, un souci technique 😅 Tapez *menu* pour recommencer.')
        } catch { /* canal en erreur : déjà loggé */ }
      }
    }
  }
}
