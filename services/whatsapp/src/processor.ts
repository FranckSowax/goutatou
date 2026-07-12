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
  /**
   * Message de localisation entrant — messages[n].location.{latitude,longitude} (+ preview
   * base64 ignoré). Shape confirmée via support.whapi.cloud/help-desk/receiving/webhooks/
   * incoming-webhooks-format/incoming-message (exemple JSON officiel Whapi, type "location").
   * Confiance : haute.
   */
  location?: { latitude: number; longitude: number }
}

export interface ProcessorDeps {
  sleep: (ms: number) => Promise<void>
  rng?: () => number
  sendDelayMinMs: number
  sendDelayMaxMs: number
  menuPhotosMax: number
}

type ProcessorWhapi = Pick<
  WhapiClient,
  'sendText' | 'sendImage' | 'sendTyping' | 'markAsRead' | 'react' | 'sendLocation'
>

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
      if (msg.from_me) continue

      // Un message location est converti en lien Google Maps et traité EXACTEMENT comme un
      // texte libre (adresse de livraison en état ADRESSE, "pas compris" ailleurs) — cf.
      // spec bot-vivant § GPS entrant. Tout autre type non-text/non-location reste ignoré
      // (comportement v1 inchangé).
      const body =
        msg.type === 'text' ? msg.text?.body :
        msg.type === 'location' && msg.location ? `https://maps.google.com/?q=${msg.location.latitude},${msg.location.longitude}` :
        undefined
      if (!body) continue

      // Idempotence : si ce message Whapi a déjà été loggé, on skip.
      const fresh = await repo.logMessage(channel.restaurantId, 'in', msg.chat_id, body, msg.id)
      if (!fresh) continue

      try {
        const customer = await repo.upsertCustomer(channel.restaurantId, msg.from, msg.chat_id, msg.from_name)

        if (isOptOutKeyword(body)) {
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

        // Bot vivant : présence "en train d'écrire" + accusé de lecture sur chaque message
        // traité, fire-and-forget (jamais attendus, jamais bloquants pour la réponse) — hors
        // état HUMAIN où un opérateur a la main (cf. spec bot-vivant § Bot humain).
        if (conv.state !== 'HUMAIN') {
          whapi.sendTyping(msg.chat_id).catch((err) => console.error('[presence]', err))
          whapi.markAsRead(msg.id).catch((err) => console.error('[presence]', err))
        }

        const baseCtx = await repo.getBotContext(channel.restaurantId, channel.restaurantName, channel.driveEnabled)

        // Détection précise des commandes globales (cf. bot/machine.ts, routage global) :
        // mêmes conditions que celles évaluées par la machine.
        const isMenuCommand = body.trim().toLowerCase() === 'menu'
        const isRoueCommand = body.trim().toLowerCase() === 'roue'
        const isPromosCommand = body.trim().toLowerCase() === 'promos'
        const isInfosCommand = body.trim().toLowerCase() === 'infos'

        // Contexte roue chargé UNIQUEMENT sur le mot-clé 'roue', et jamais en état HUMAIN
        // (où la commande serait de toute façon avalée silencieusement par la machine) :
        // la machine reste pure, le processor injecte l'effet de lecture repo dans ctx.wheel.
        const ctx = isRoueCommand && conv.state !== 'HUMAIN'
          ? { ...baseCtx, wheel: await repo.getWheelInfo(channel.restaurantId, customer.id) }
          : baseCtx

        const res = transition(conv.state, conv.cart, body, ctx)
        const replies = [...res.replies]
        let nextCart = res.cart

        if (res.createOrder) {
          const order = await repo.createOrder(channel.restaurantId, customer.id, res.cart)
          replies.push(orderConfirmedCopy(order.orderNumber, order.total, res.cart))
          nextCart = EMPTY_CART
          // Réaction ✅ UNIQUEMENT quand la commande a bien été créée (awaited best-effort :
          // un échec Whapi ne doit jamais faire échouer la conversation — cf. spec).
          await whapi.react(msg.id, '✅').catch((err) => console.error('[react]', err))
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

        // Carte du restaurant sur "infos" quand les coordonnées GPS sont renseignées (fiche
        // admin / réglages) : envoyée EN PLUS, après le bloc texte (même pattern que les
        // photos du menu), best-effort — cf. spec bot-vivant § GPS sortant. res.replies non
        // vide confirme le même routage global que pour 'menu'/'promos' (pas avalé par HUMAIN).
        if (isInfosCommand && res.replies.length > 0 && ctx.gps) {
          try {
            const sent = await whapi.sendLocation(msg.chat_id, ctx.gps.lat, ctx.gps.lng, channel.restaurantName)
            await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, '📍 Position partagée', sent.id)
          } catch (err) {
            console.error('[gps]', err)
          }
        }

        // res.replies non vide confirme que la transition a bien emprunté le routage global
        // 'promos' (et non un état HUMAIN qui l'aurait avalé silencieusement — seul cas où
        // une commande globale produit une liste de réponses vide). Écriture best-effort :
        // un échec d'opt-in ne doit jamais faire échouer la conversation en cours.
        if (isPromosCommand && res.replies.length > 0) {
          try {
            await repo.setMarketingOptIn(channel.restaurantId, customer.id)
          } catch (err) {
            console.error('[processor] setMarketingOptIn échoué', err)
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
