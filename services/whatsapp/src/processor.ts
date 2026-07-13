import { EMPTY_CART, formatFcfa, type BotState, type Cart, type CartItem } from '@goutatou/db'
import type { WhapiClient } from '@goutatou/whapi'
import { buttonsForState, matchButtonInput, type ButtonChoice } from './bot/buttons.js'
import { beginCheckout, flatMenuItems, transition, type BotContext } from './bot/machine.js'
import { isOptOutKeyword } from './campaigns/optout.js'
import { nextSendDelayMs } from './campaigns/throttle.js'
import type { BotRepo } from './repo.js'
import { APPROVAL_COPY, isManagerSender, parseApprovalButton, type ParsedApprovalButton } from './autostatus/approval.js'
import type { ApprovalRepo } from './autostatus/approval-repo.js'
import { buildStatusCaption } from './autostatus/captions.js'
import {
  CHANNEL_APPROVAL_COPY,
  parseChannelApprovalButton,
  type ParsedChannelApprovalButton,
} from './autochannel/approval.js'
import type { ChannelApprovalRepo } from './autochannel/approval-repo.js'
import { buildChannelCaption } from './autochannel/captions.js'

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
  /**
   * Panier WhatsApp natif entrant — messages[n].order.order_id (+ seller/title/token/item_count/
   * currency/total_price/status/preview, ignorés ici). Shape confirmée via
   * support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/incoming-message
   * (exemple JSON officiel Whapi, type "order" : `"order": { "order_id": "964278...", ... }`).
   * Confiance : haute sur order_id ; le corps de la réponse GET /business/orders/{id} (items)
   * reste basse confiance côté client whapi (cf. packages/whapi/src/client.ts getOrderItems).
   */
  order?: { order_id?: string; token?: string }
  /**
   * Réponse à un message interactif (bouton ou liste) entrant — messages[n].type 'reply'.
   * Bouton : reply.type === 'buttons_reply', reply.buttons_reply.{id,title} — shape confirmée
   * par support.whapi.cloud (doc incoming officielle), id retransmis verbatim (confiance
   * haute). Liste : reply.type === 'list_reply', reply.list_reply.{id,title} — shape ASSUMÉE
   * par analogie (confiance BASSE, jamais vérifiée en réel) : le payload brut est loggé
   * (cf. boucle principale) pour confirmer/corriger au premier tap réel d'une liste.
   */
  reply?: {
    type?: string
    buttons_reply?: { id?: string; title?: string }
    list_reply?: { id?: string; title?: string }
  }
}

export interface ProcessorDeps {
  sleep: (ms: number) => Promise<void>
  rng?: () => number
  sendDelayMinMs: number
  sendDelayMaxMs: number
  menuPhotosMax: number
  /**
   * Optionnel (contrairement aux autres deps) : validation des statuts auto (VS4) est une
   * fonctionnalité additive — un déploiement/test qui ne le fournit pas ignore silencieusement
   * les taps `stapp:`/`strej:`/`streg:`/`stcan:` plutôt que de planter (cf. handleApprovalButton).
   */
  approvalRepo?: ApprovalRepo
  /**
   * Optionnel (même contrat que `approvalRepo`) : validation des posts chaîne auto (CA5) est une
   * fonctionnalité additive — un déploiement/test qui ne le fournit pas ignore silencieusement les
   * taps `chapp:`/`chrej:`/`chreg:`/`chcan:` plutôt que de planter (cf. handleChannelApprovalButton).
   */
  channelApprovalRepo?: ChannelApprovalRepo
}

// sendQuickReplies/sendList OPTIONNELS (contrairement aux autres méthodes) : la couche
// boutons est un ajout best-effort par-dessus le texte, jamais une dépendance dure — un
// whapi/mock qui ne les fournit pas doit continuer à fonctionner en texte (cf. fallback
// dans sendOneReply). C'est aussi ce qui permet aux mocks des tests existants (sans ces
// deux méthodes) de rester valides sans modification.
type ProcessorWhapi = Pick<
  WhapiClient,
  'sendText' | 'sendImage' | 'sendTyping' | 'markAsRead' | 'react' | 'sendLocation' | 'sendCatalog' | 'getOrderItems'
> &
  Partial<Pick<WhapiClient, 'sendQuickReplies' | 'sendList'>>

const CART_UNAVAILABLE_FR =
  'Ces articles ne sont plus disponibles — tapez *menu* pour voir la carte.'
const CART_READ_FAILED_FR =
  "Nous n'avons pas pu lire votre panier — tapez *menu* pour commander."

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

/** Contexte nécessaire pour tenter un envoi interactif sur la DERNIÈRE réponse d'un lot. */
interface InteractiveContext {
  state: BotState
  cart: Cart
  ctx: BotContext
}

// Limites observées/documentées (cf. .agents/skills/whapi/references/msg-interactive.md +
// packages/whapi/src/client.ts) : 3 boutons quick-reply max, 10 lignes de liste max. Les
// titres sont tronqués défensivement (aucune limite officielle documentée pour les quick-reply,
// mais les boutons WhatsApp les coupent visuellement au-delà d'une vingtaine de caractères).
const QUICK_REPLY_TITLE_MAX = 20
const LIST_ROW_TITLE_MAX = 24

function truncateTitle(title: string, max: number): string {
  return title.length > max ? `${title.slice(0, Math.max(0, max - 1))}…` : title
}

/**
 * Envoie UNE réponse : interactive (boutons/liste) si `choices` est fourni et de taille
 * envoyable, sinon texte simple. body = le texte de la réponse INCHANGÉ dans les deux cas
 * (les boutons ne le remplacent pas, ils s'affichent en plus). Tout échec d'envoi interactif
 * (méthode absente du mock/whapi, rejet réseau, dépassement de limite) retombe sur le texte —
 * jamais de message perdu. logMessage 'out' ne logge qu'UNE fois, le texte, quel que soit le
 * transport effectivement utilisé (cf. spec bot-boutons § Processor).
 */
async function sendOneReply(
  whapi: ProcessorWhapi,
  repo: BotRepo,
  restaurantId: string,
  chatId: string,
  reply: string,
  choices: ButtonChoice[] | null,
): Promise<void> {
  if (choices && choices.length > 0 && choices.length <= 10) {
    try {
      let sent: { id?: string }
      if (choices.length <= 3) {
        if (!whapi.sendQuickReplies) throw new Error('sendQuickReplies indisponible')
        sent = await whapi.sendQuickReplies(
          chatId, reply,
          choices.map((c) => ({ id: c.id, title: truncateTitle(c.title, QUICK_REPLY_TITLE_MAX) })),
        )
      } else {
        if (!whapi.sendList) throw new Error('sendList indisponible')
        sent = await whapi.sendList(
          chatId, reply, 'Choisir',
          choices.map((c) => ({ id: c.id, title: truncateTitle(c.title, LIST_ROW_TITLE_MAX) })),
        )
      }
      await repo.logMessage(restaurantId, 'out', chatId, reply, sent.id)
      return
    } catch (err) {
      console.error('[buttons] échec envoi interactif, repli texte', err)
    }
  }
  try {
    const sent = await whapi.sendText(chatId, reply)
    await repo.logMessage(restaurantId, 'out', chatId, reply, sent.id)
  } catch (err) {
    await repo.logMessage(restaurantId, 'out', chatId, reply, undefined, String(err))
  }
}

/**
 * Envoi séquentiel des réponses d'une transition, chacune loggée (succès ou échec Whapi).
 * Si `interactive` est fourni et que son état fait partie des choix fermés standard (MODE/
 * CRENEAU/SUPPLEMENTS/SUPPLEMENTS_CHECKOUT/CONFIRMATION), la DERNIÈRE réponse du lot est
 * tentée en interactif (boutons/liste) — toutes les autres partent en texte comme aujourd'hui.
 */
async function sendReplies(
  whapi: ProcessorWhapi,
  repo: BotRepo,
  restaurantId: string,
  chatId: string,
  replies: string[],
  interactive?: InteractiveContext,
): Promise<void> {
  for (let i = 0; i < replies.length; i++) {
    const isLast = i === replies.length - 1
    const choices = isLast && interactive
      ? buttonsForState(interactive.state, interactive.cart, interactive.ctx)
      : null
    await sendOneReply(whapi, repo, restaurantId, chatId, replies[i], choices)
  }
}

/**
 * Panier WhatsApp natif entrant (message type 'order') : récupère les articles composés côté
 * client (getOrderItems), les mappe aux plats DISPONIBLES du menu par retailer_id === menu_item.id
 * (cf. worker catalog-sync) — nom/prix TOUJOURS lus en base, JAMAIS depuis le webhook — puis
 * enchaîne sur beginCheckout comme une transition normale (état persisté, réponses envoyées via
 * le même chemin que sendReplies). Politique v1 : articles inconnus/indisponibles droppés
 * silencieusement (cf. spec catalogue § Conversation). Best-effort : order_id manquant ou
 * getOrderItems en échec → message FR générique, jamais de crash.
 */
async function handleNativeOrder(
  whapi: ProcessorWhapi,
  repo: BotRepo,
  restaurantId: string,
  customerId: string,
  chatId: string,
  orderId: string | undefined,
  orderToken: string | undefined,
  ctx: BotContext,
): Promise<void> {
  let items: Array<{ retailer_id?: string; quantity?: number }>
  try {
    if (!orderId) throw new Error('order.order_id manquant dans le webhook')
    // order_token requis par l'API (403 « need order token » sinon) — fourni
    // dans le webhook du panier, transmis en query.
    items = await whapi.getOrderItems(orderId, orderToken)
  } catch (err) {
    console.error('[order] getOrderItems échoué', err)
    await sendReplies(whapi, repo, restaurantId, chatId, [CART_READ_FAILED_FR])
    return
  }

  const menuItems = flatMenuItems(ctx.menu)
  const lines: CartItem[] = []
  // Garde-fou : la forme exacte de getOrderItems est basse confiance (cf. client whapi) — un
  // retour non-tableau est traité comme un panier vide plutôt que de faire planter le message.
  for (const it of Array.isArray(items) ? items : []) {
    const qty = it.quantity ?? 0
    if (!it.retailer_id || qty <= 0) continue
    // Constaté en réel (2026-07-12) : les items de /business/orders exposent sous
    // product_retailer_id l'ID PRODUIT WhatsApp (= notre wa_product_id), pas notre
    // uuid de plat. On matche donc les deux clés.
    const menuItem = menuItems.find((m) => m.id === it.retailer_id || m.waProductId === it.retailer_id)
    if (!menuItem) continue
    lines.push({ menuItemId: menuItem.id, name: menuItem.name, unitPrice: menuItem.price, qty, supplements: [] })
  }

  if (lines.length === 0) {
    await sendReplies(whapi, repo, restaurantId, chatId, [CART_UNAVAILABLE_FR])
    return
  }

  const res = beginCheckout({ items: lines }, ctx)
  await repo.saveConversation(restaurantId, customerId, res.state, res.cart)
  await sendReplies(whapi, repo, restaurantId, chatId, res.replies, { state: res.state, cart: res.cart, ctx })
}

/**
 * Envoie l'image régénérée + relance les boutons Valider/Refuser (mêmes ids `stapp:`/`strej:`
 * que la sollicitation initiale envoyée par le worker auto-status, cf. spec § Flux 1) — le
 * gérant revalide le NOUVEAU contenu exactement comme le premier. Best-effort : chaque envoi est
 * loggé indépendamment (succès ou échec), jamais bloquant.
 */
async function sendApprovalImage(
  whapi: ProcessorWhapi,
  repo: BotRepo,
  restaurantId: string,
  chatId: string,
  mediaUrl: string,
  caption: string,
  statusId: string,
): Promise<void> {
  try {
    const sent = await whapi.sendImage(chatId, mediaUrl, caption)
    await repo.logMessage(restaurantId, 'out', chatId, caption, sent.id)
  } catch (err) {
    await repo.logMessage(restaurantId, 'out', chatId, caption, undefined, String(err))
  }
  await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.reapprovePrompt, [
    { id: `stapp:${statusId}`, title: APPROVAL_COPY.validateTitle },
    { id: `strej:${statusId}`, title: APPROVAL_COPY.refuseTitle },
  ])
}

/**
 * Validation gérant des statuts auto (VS4, cf. docs/superpowers/specs/2026-07-13-validation-
 * statuts-design.md § Réponse gérant) : traite UN tap sur `stapp:`/`strej:`/`streg:`/`stcan:`.
 * Appelée AVANT le flux machine normal (cf. createProcessor) — la conversation client n'est ni
 * lue ni modifiée ici, il ne s'agit pas d'un message client mais d'une action du gérant.
 *
 * Garde de sécurité (pas de validation croisée) : le statut doit appartenir au restaurant DU
 * CANAL qui a reçu ce webhook ET avoir été auto-généré (les statuts manuels ne passent jamais
 * par ce flux, cf. spec § Hors scope) — `getStatus` filtre déjà `restaurant_id` côté requête,
 * `auto_generated` est revérifié ici en défense en profondeur.
 */
async function handleApprovalButton(
  whapi: ProcessorWhapi,
  repo: BotRepo,
  approvalRepo: ApprovalRepo | undefined,
  restaurantId: string,
  chatId: string,
  whapiMessageId: string,
  replyTitle: string | undefined,
  parsed: ParsedApprovalButton,
): Promise<void> {
  const logBody = replyTitle ?? `${parsed.action}:${parsed.statusId}`
  const fresh = await repo.logMessage(restaurantId, 'in', chatId, logBody, whapiMessageId)
  if (!fresh) return // idempotence : webhook déjà traité (même politique que le flux machine)

  if (!approvalRepo) {
    console.error('[approval] approvalRepo non configuré — bouton de validation ignoré')
    return
  }

  const status = await approvalRepo.getStatus(parsed.statusId, restaurantId)
  if (!status || !status.autoGenerated) {
    await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.notAvailable, null)
    return
  }
  // Durcissement (revue finale) : seul le NUMÉRO du gérant validateur peut agir sur la
  // demande — pas seulement « quelqu'un du bon restaurant ». La portée par restaurant + l'id
  // UUID (délivré au seul gérant) étaient déjà en place ; on ajoute l'identité de l'émetteur.
  if (!isManagerSender(chatId, status.managerPhone)) {
    await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.notAvailable, null)
    return
  }

  switch (parsed.action) {
    case 'approve': {
      if (status.state !== 'pending_approval') {
        await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.alreadyHandled, null)
        return
      }
      const ok = await approvalRepo.approve(status.id)
      await sendOneReply(
        whapi, repo, restaurantId, chatId,
        ok ? APPROVAL_COPY.approved : APPROVAL_COPY.alreadyHandled, null,
      )
      return
    }

    case 'reject': {
      if (status.state !== 'pending_approval') {
        await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.alreadyHandled, null)
        return
      }
      await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.rejectPrompt, [
        { id: `streg:${status.id}`, title: APPROVAL_COPY.regenerateTitle },
        { id: `stcan:${status.id}`, title: APPROVAL_COPY.cancelTitle },
      ])
      return
    }

    case 'regen': {
      if (status.state !== 'pending_approval') {
        await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.alreadyHandled, null)
        return
      }
      const dish = await approvalRepo.getNextDish(restaurantId, status.mediaUrl)
      if (!dish) {
        await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.noDishToRegenerate, null)
        return
      }
      const content = buildStatusCaption({ name: dish.name, price: dish.price }, dish.index)
      const ok = await approvalRepo.regenerate(status.id, content, dish.photoUrl)
      if (!ok) {
        await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.alreadyHandled, null)
        return
      }
      await sendApprovalImage(whapi, repo, restaurantId, chatId, dish.photoUrl, content, status.id)
      return
    }

    case 'cancel': {
      if (status.state !== 'pending_approval') {
        await sendOneReply(whapi, repo, restaurantId, chatId, APPROVAL_COPY.alreadyHandled, null)
        return
      }
      const ok = await approvalRepo.cancel(status.id)
      await sendOneReply(
        whapi, repo, restaurantId, chatId,
        ok ? APPROVAL_COPY.canceled : APPROVAL_COPY.alreadyHandled, null,
      )
      return
    }
  }
}

/**
 * Envoie l'image régénérée + relance les boutons Valider/Refuser (mêmes ids `chapp:`/`chrej:`
 * que la sollicitation initiale envoyée par le worker auto-channel, mirror `sendApprovalImage`
 * ci-dessus) — le gérant revalide le NOUVEAU contenu exactement comme le premier. Best-effort :
 * chaque envoi est loggé indépendamment (succès ou échec), jamais bloquant.
 */
async function sendChannelApprovalImage(
  whapi: ProcessorWhapi,
  repo: BotRepo,
  restaurantId: string,
  chatId: string,
  mediaUrl: string,
  caption: string,
  postId: string,
): Promise<void> {
  try {
    const sent = await whapi.sendImage(chatId, mediaUrl, caption)
    await repo.logMessage(restaurantId, 'out', chatId, caption, sent.id)
  } catch (err) {
    await repo.logMessage(restaurantId, 'out', chatId, caption, undefined, String(err))
  }
  await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.reapprovePrompt, [
    { id: `chapp:${postId}`, title: CHANNEL_APPROVAL_COPY.validateTitle },
    { id: `chrej:${postId}`, title: CHANNEL_APPROVAL_COPY.refuseTitle },
  ])
}

/**
 * Validation gérant des posts chaîne auto (CA5) : traite UN tap sur `chapp:`/`chrej:`/`chreg:`/
 * `chcan:`. Logique IDENTIQUE à `handleApprovalButton` (statuts) mais via `channelApprovalRepo` +
 * `CHANNEL_APPROVAL_COPY` + `buildChannelCaption` pour la régénération. Appelée AVANT le flux
 * machine normal (cf. createProcessor) — la conversation client n'est ni lue ni modifiée ici, il
 * ne s'agit pas d'un message client mais d'une action du gérant. Le mode groupe n'est PAS géré
 * ici (les votes sont traités par le channel-decision worker) : ces boutons ne concernent que le
 * mode gérant.
 *
 * Garde de sécurité (pas de validation croisée) : le post doit appartenir au restaurant DU CANAL
 * qui a reçu ce webhook ET avoir été auto-généré — `getPost` filtre déjà `restaurant_id` côté
 * requête, `auto_generated` est revérifié ici en défense en profondeur.
 */
async function handleChannelApprovalButton(
  whapi: ProcessorWhapi,
  repo: BotRepo,
  channelApprovalRepo: ChannelApprovalRepo | undefined,
  restaurantId: string,
  chatId: string,
  whapiMessageId: string,
  replyTitle: string | undefined,
  parsed: ParsedChannelApprovalButton,
): Promise<void> {
  const logBody = replyTitle ?? `${parsed.action}:${parsed.postId}`
  const fresh = await repo.logMessage(restaurantId, 'in', chatId, logBody, whapiMessageId)
  if (!fresh) return // idempotence : webhook déjà traité (même politique que le flux machine)

  if (!channelApprovalRepo) {
    console.error('[channel-approval] channelApprovalRepo non configuré — bouton de validation ignoré')
    return
  }

  const post = await channelApprovalRepo.getPost(parsed.postId, restaurantId)
  if (!post || !post.autoGenerated) {
    await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.notAvailable, null)
    return
  }
  // Durcissement (mirror statuts) : seul le NUMÉRO du gérant validateur peut agir sur la demande —
  // pas seulement « quelqu'un du bon restaurant ». La portée par restaurant + l'id UUID (délivré au
  // seul gérant) étaient déjà en place ; on ajoute l'identité de l'émetteur.
  if (!isManagerSender(chatId, post.managerPhone)) {
    await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.notAvailable, null)
    return
  }

  switch (parsed.action) {
    case 'approve': {
      if (post.state !== 'pending_approval') {
        await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.alreadyHandled, null)
        return
      }
      const ok = await channelApprovalRepo.approve(post.id)
      await sendOneReply(
        whapi, repo, restaurantId, chatId,
        ok ? CHANNEL_APPROVAL_COPY.approved : CHANNEL_APPROVAL_COPY.alreadyHandled, null,
      )
      return
    }

    case 'reject': {
      if (post.state !== 'pending_approval') {
        await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.alreadyHandled, null)
        return
      }
      await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.rejectPrompt, [
        { id: `chreg:${post.id}`, title: CHANNEL_APPROVAL_COPY.regenerateTitle },
        { id: `chcan:${post.id}`, title: CHANNEL_APPROVAL_COPY.cancelTitle },
      ])
      return
    }

    case 'regen': {
      if (post.state !== 'pending_approval') {
        await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.alreadyHandled, null)
        return
      }
      const dish = await channelApprovalRepo.getNextDish(restaurantId, post.mediaUrl)
      if (!dish) {
        await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.noDishToRegenerate, null)
        return
      }
      // contactPhone non disponible sur ce chemin (getPost ne le renvoie pas) → null, le lien
      // wa.me est simplement absent de la légende régénérée (cf. plan CA5, garde simple).
      const content = buildChannelCaption({ name: dish.name, price: dish.price }, dish.index, null)
      const ok = await channelApprovalRepo.regenerate(post.id, content, dish.photoUrl)
      if (!ok) {
        await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.alreadyHandled, null)
        return
      }
      await sendChannelApprovalImage(whapi, repo, restaurantId, chatId, dish.photoUrl, content, post.id)
      return
    }

    case 'cancel': {
      if (post.state !== 'pending_approval') {
        await sendOneReply(whapi, repo, restaurantId, chatId, CHANNEL_APPROVAL_COPY.alreadyHandled, null)
        return
      }
      const ok = await channelApprovalRepo.cancel(post.id)
      await sendOneReply(
        whapi, repo, restaurantId, chatId,
        ok ? CHANNEL_APPROVAL_COPY.canceled : CHANNEL_APPROVAL_COPY.alreadyHandled, null,
      )
      return
    }
  }
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

      // Tap sur un bouton/liste envoyé par le bot — messages[n].type 'reply'. Payload brut
      // TOUJOURS loggé (console) : la shape bouton (buttons_reply) est confirmée par la doc
      // Whapi, mais celle de liste (list_reply) est ASSUMÉE par analogie (cf. WhapiMessage.reply)
      // — ce log documente la réalité au premier tap réel d'une liste. Convention id `in:<texte>`
      // (cf. src/bot/buttons.ts) : retraduite en entrée machine texte ; sans préfixe → le
      // titre du bouton sert de repli (bouton/liste non généré par ce bot, ou format inattendu).
      const isReplyMessage = msg.type === 'reply'
      if (isReplyMessage) {
        console.log('[buttons] reply payload', JSON.stringify(msg.reply))
      }
      const replyId = msg.reply?.buttons_reply?.id ?? msg.reply?.list_reply?.id
      const replyTitle = msg.reply?.buttons_reply?.title ?? msg.reply?.list_reply?.title

      // Validation gérant des statuts auto (VS4, cf. spec § Réponse gérant) : ids `stapp:`/
      // `strej:`/`streg:`/`stcan:` INTERCEPTÉS ICI — avant le routage `in:`→machine ET avant
      // l'opt-out ci-dessous — car ce ne sont pas des messages client (pas de customer, pas de
      // conversation) mais des taps du GÉRANT sur les boutons envoyés par le worker auto-status.
      // Séparé du bloc try principal (upsertCustomer/loadConversation n'ont pas de sens ici) ;
      // erreur imprévue best-effort loggée, jamais propagée dans la boucle webhook.
      if (isReplyMessage && replyId) {
        const approvalAction = parseApprovalButton(replyId)
        if (approvalAction) {
          try {
            await handleApprovalButton(
              whapi, repo, deps.approvalRepo, channel.restaurantId, msg.chat_id, msg.id,
              replyTitle, approvalAction,
            )
          } catch (err) {
            console.error(`[approval] erreur message ${msg.id}`, err)
          }
          continue
        }

        // Validation gérant des posts chaîne auto (CA5) : ids `chapp:`/`chrej:`/`chreg:`/`chcan:`
        // INTERCEPTÉS ICI — même emplacement/raisonnement que les boutons statut ci-dessus, pendant
        // dédié préfixe `ch` (ne peut jamais matcher un id `st*`, cf. autochannel/approval.ts).
        const channelApprovalAction = parseChannelApprovalButton(replyId)
        if (channelApprovalAction) {
          try {
            await handleChannelApprovalButton(
              whapi, repo, deps.channelApprovalRepo, channel.restaurantId, msg.chat_id, msg.id,
              replyTitle, channelApprovalAction,
            )
          } catch (err) {
            console.error(`[channel-approval] erreur message ${msg.id}`, err)
          }
          continue
        }
      }

      // Un message location est converti en lien Google Maps et traité EXACTEMENT comme un
      // texte libre (adresse de livraison en état ADRESSE, "pas compris" ailleurs) — cf.
      // spec bot-vivant § GPS entrant. Un message 'order' (panier WhatsApp natif) n'a pas de
      // texte : body sert uniquement au log entrant, le routage réel se fait via isOrderMessage
      // ci-dessous (pas d'appel à transition()). Un message 'reply' est converti en ENTRÉE
      // MACHINE (id sans préfixe `in:` → titre en repli) et traité EXACTEMENT comme un texte
      // libre à partir d'ici (opt-out, mots-clés globaux, transition — même pipeline). Tout
      // autre type non-text/non-location/non-order/non-reply reste ignoré (comportement v1
      // inchangé).
      const isOrderMessage = msg.type === 'order'
      const body =
        msg.type === 'text' ? msg.text?.body :
        msg.type === 'location' && msg.location ? `https://maps.google.com/?q=${msg.location.latitude},${msg.location.longitude}` :
        isOrderMessage ? '🛒 Panier WhatsApp' :
        isReplyMessage ? (replyId?.startsWith('in:') ? replyId.slice(3) : (replyTitle ?? undefined)) :
        undefined
      if (!body) continue

      // Le log entrant affiche le texte LISIBLE (titre du bouton/ligne tapé), pas l'id
      // technique `in:x` retraduit en entrée machine — cf. spec bot-boutons § Processor.
      const logBody = isReplyMessage ? (replyTitle ?? body) : body

      // Idempotence : si ce message Whapi a déjà été loggé, on skip.
      const fresh = await repo.logMessage(channel.restaurantId, 'in', msg.chat_id, logBody, msg.id)
      if (!fresh) continue

      try {
        const customer = await repo.upsertCustomer(channel.restaurantId, msg.from, msg.chat_id, msg.from_name)

        // Panier natif : pas de texte libre, pas de routage global (opt-out/roue/etc n'ont pas
        // de sens pour ce type de message) — traitement dédié puis message suivant.
        if (isOrderMessage) {
          const orderCtx = await repo.getBotContext(channel.restaurantId, channel.restaurantName, channel.driveEnabled)
          await handleNativeOrder(whapi, repo, channel.restaurantId, customer.id, msg.chat_id, msg.order?.order_id, msg.order?.token, orderCtx)
          continue
        }

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

        // Round-trip de l'id `in:<x>` non garanti par WhatsApp : un tap peut revenir sans id (ou
        // en texte), body ne portant alors que le TITRE du bouton. On le retraduit en entrée
        // machine en le matchant aux choix fermés de l'état courant (sinon re-prompt en boucle,
        // cf. bug suppléments « Non merci »). Ne modifie body que sur un match — aucun effet sur
        // les entrées déjà canoniques (« 2 », « oui »…) ni sur les états sans boutons.
        const effectiveBody = matchButtonInput(conv.state, conv.cart, ctx, body) ?? body

        const res = transition(conv.state, conv.cart, effectiveBody, ctx)
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

        // Interactif tenté sur la DERNIÈRE réponse du lot UNIQUEMENT (res.replies, pas le
        // texte de confirmation de commande ajouté au-dessus — res.state vaut alors ACCUEIL,
        // hors des états à choix fermés, donc buttonsForState renvoie null : comportement
        // déjà correct sans condition supplémentaire ici).
        await sendReplies(whapi, repo, channel.restaurantId, msg.chat_id, replies, { state: res.state, cart: res.cart, ctx })

        // res.state === 'MENU' confirme que la transition a bien emprunté le routage
        // global 'menu' (et non un état HUMAIN qui l'aurait avalé silencieusement). Catalogue
        // natif (carte WhatsApp) À LA PLACE des photos quand catalog_enabled ET au moins un
        // plat synchronisé (wa_product_id) — sinon photos inchangées (non-régression).
        if (isMenuCommand && res.state === 'MENU') {
          const catalogReady = channel.catalogEnabled
            ? await repo.hasWaProducts(channel.restaurantId).catch((err) => {
                console.error('[catalog] hasWaProducts échoué, repli photos', err)
                return false
              })
            : false

          if (catalogReady) {
            try {
              const sent = await whapi.sendCatalog(msg.chat_id)
              await repo.logMessage(channel.restaurantId, 'out', msg.chat_id, '🛍️ Catalogue envoyé', sent.id)
            } catch (err) {
              console.error('[catalog] échec envoi carte catalogue', err)
            }
          } else {
            try {
              await sendMenuPhotos(whapi, repo, channel.restaurantId, msg.chat_id, ctx.menu, deps)
            } catch (err) {
              console.error('[menu-photos] erreur inattendue', err)
            }
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
