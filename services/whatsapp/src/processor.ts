import { EMPTY_CART, formatFcfa } from '@goutatou/db'
import type { WhapiClient } from '@goutatou/whapi'
import { flatMenuItems, transition, type BotContext } from './bot/machine.js'
import { isOptOutKeyword } from './campaigns/optout.js'
import { nextSendDelayMs } from './campaigns/throttle.js'
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

export interface ProcessorDeps {
  sleep: (ms: number) => Promise<void>
  rng?: () => number
  sendDelayMinMs: number
  sendDelayMaxMs: number
  menuPhotosMax: number
}

type ProcessorWhapi = Pick<WhapiClient, 'sendText' | 'sendImage'>

/**
 * Envoi des photos des plats disponibles après la réponse texte à la commande *menu*.
 * Complément au menu texte (source canonique) : throttlé, cappé, jamais bloquant pour
 * la conversation (chaque échec est loggé et n'interrompt pas les envois suivants).
 */
async function sendMenuPhotos(
  whapi: ProcessorWhapi,
  repo: BotRepo,
  restaurantId: string,
  chatId: string,
  menu: BotContext['menu'],
  deps: ProcessorDeps,
): Promise<void> {
  if (deps.menuPhotosMax <= 0) return

  const dishes = flatMenuItems(menu)
    .filter((it): it is typeof it & { photoUrl: string } => !!it.photoUrl)
    .slice(0, deps.menuPhotosMax)

  for (let i = 0; i < dishes.length; i++) {
    const dish = dishes[i]
    const caption = `${dish.name} — ${formatFcfa(dish.price)}`
    try {
      const sent = await whapi.sendImage(chatId, dish.photoUrl, caption)
      await repo.logMessage(restaurantId, 'out', chatId, caption, sent.id)
    } catch (err) {
      console.error(`[menu-photos] échec envoi photo plat ${dish.id}`, err)
    }
    if (i < dishes.length - 1) {
      await deps.sleep(nextSendDelayMs(deps.sendDelayMinMs, deps.sendDelayMaxMs, deps.rng))
    }
  }
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
  makeWhapi: (token: string) => ProcessorWhapi,
  deps: ProcessorDeps,
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

        // Détection précise de la commande globale 'menu' (cf. bot/machine.ts, routage
        // global) : c'est cette même condition qui déclenche le rendu du menu texte.
        const isMenuCommand = msg.text.body.trim().toLowerCase() === 'menu'

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

        // res.state === 'MENU' confirme que la transition a bien emprunté le routage
        // global 'menu' (et non un état HUMAIN qui l'aurait avalé silencieusement).
        if (isMenuCommand && res.state === 'MENU') {
          try {
            await sendMenuPhotos(whapi, repo, channel.restaurantId, msg.chat_id, ctx.menu, deps)
          } catch (err) {
            console.error('[menu-photos] erreur inattendue', err)
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
