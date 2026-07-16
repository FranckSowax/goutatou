import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor, type ProcessorDeps } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'
import { copy } from '../src/bot/copy.js'

const CHAT_ID = '24177000001@s.whatsapp.net'

const deps: ProcessorDeps = {
  sleep: vi.fn().mockResolvedValue(undefined),
  sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 8,
}

function webhookPayload(body: string, overrides: Record<string, unknown> = {}) {
  return {
    messages: [{
      id: 'MSG-' + body,
      from_me: false,
      type: 'text',
      chat_id: CHAT_ID,
      from: '24177000001',
      from_name: 'Client Test',
      text: { body },
      ...overrides,
    }],
    channel_id: 'WHAPI-CHAN',
  }
}

function replyPayload(reply: { type?: string; buttons_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } }) {
  return {
    messages: [{
      id: 'MSG-REPLY',
      from_me: false,
      type: 'reply',
      chat_id: CHAT_ID,
      from: '24177000001',
      from_name: 'Client Test',
      reply,
    }],
    channel_id: 'WHAPI-CHAN',
  }
}

function orderPayload(orderId: string, overrides: Record<string, unknown> = {}) {
  return {
    messages: [{
      id: 'MSG-ORDER', from_me: false, type: 'order',
      chat_id: CHAT_ID, from: '24177000001', from_name: 'Client',
      order: { order_id: orderId, token: 'ord-tok' },
      ...overrides,
    }],
    channel_id: 'CH',
  }
}

const menuWithSupplements2 = {
  categories: [{ name: 'Plats', items: [
    { id: 'i1', name: 'Bo Bun', price: 4500, supplements: [
      { id: 's1', name: 'Œuf', price: 300 },
      { id: 's2', name: 'Bœuf', price: 1000 },
    ] },
  ] }],
}

const menuWithSupplements5 = {
  categories: [{ name: 'Plats', items: [
    { id: 'i1', name: 'Bo Bun', price: 4500, supplements: [
      { id: 's1', name: 'Œuf', price: 300 },
      { id: 's2', name: 'Bœuf', price: 1000 },
      { id: 's3', name: 'Porc', price: 900 },
      { id: 's4', name: 'Crevette', price: 1200 },
      { id: 's5', name: 'Piment', price: 100 },
    ] },
  ] }],
}

const simpleMenu = {
  categories: [{ name: 'Plats', items: [{ id: 'i1', name: 'Bo Bun', price: 4500 }] }],
}

describe('processor — boutons WhatsApp sur les choix fermés', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>
  let sendQuickReplies: ReturnType<typeof vi.fn>
  let sendList: ReturnType<typeof vi.fn>
  let getOrderItems: ReturnType<typeof vi.fn>

  function process() {
    return createProcessor(repo, () => ({
      sendText,
      sendImage: vi.fn().mockResolvedValue({ id: 'OUT-IMG' }),
      sendTyping: vi.fn().mockResolvedValue(undefined),
      markAsRead: vi.fn().mockResolvedValue(undefined),
      react: vi.fn().mockResolvedValue(undefined),
      sendLocation: vi.fn().mockResolvedValue({ id: 'OUT-LOC' }),
      sendCatalog: vi.fn().mockResolvedValue({ id: 'OUT-CATALOG' }),
      getOrderItems,
      sendQuickReplies,
      sendList,
    }), deps)
  }

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-TEXT' })
    sendQuickReplies = vi.fn().mockResolvedValue({ id: 'OUT-QR' })
    sendList = vi.fn().mockResolvedValue({ id: 'OUT-LIST' })
    getOrderItems = vi.fn()
    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: simpleMenu,
      }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust-1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      setMarketingOptIn: vi.fn().mockResolvedValue(undefined),
      getWheelInfo: vi.fn().mockResolvedValue({ enabled: false, triggerOrders: 5, orderCount: 0 }),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn().mockResolvedValue({ orderNumber: 42, total: 4500 }),
      logMessage: vi.fn().mockResolvedValue(true),
    }
  })

  describe('sortie interactive', () => {
    it('MODE → sendQuickReplies avec les 3 boutons de mode (ids in:1/2/3)', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({
        state: 'MENU',
        cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] },
      })
      await process()('chan-uuid', webhookPayload('valider'))

      expect(sendQuickReplies).toHaveBeenCalledTimes(1)
      const [to, body, buttons] = sendQuickReplies.mock.calls[0]
      expect(to).toBe(CHAT_ID)
      expect(body).toBe(copy.chooseMode(['🚗 Drive (retrait sur créneau)', '🛵 Livraison', '🥡 À emporter']))
      expect(buttons.map((b: { id: string }) => b.id)).toEqual(['in:1', 'in:2', 'in:3'])
      expect(sendText).not.toHaveBeenCalled()
      expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'out', CHAT_ID, body, 'OUT-QR')
    })

    it('suppléments (2 dispo) → 3 boutons quick-reply, "Non merci" en dernier', async () => {
      repo.getBotContext = vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: menuWithSupplements2,
      })
      repo.loadConversation = vi.fn().mockResolvedValue({ state: 'MENU', cart: EMPTY_CART })
      await process()('chan-uuid', webhookPayload('1'))

      expect(sendQuickReplies).toHaveBeenCalledTimes(1)
      const [, , buttons] = sendQuickReplies.mock.calls[0]
      expect(buttons).toEqual([
        { id: 'in:1', title: 'Œuf +300 F' },
        { id: 'in:2', title: 'Bœuf +1000 F' },
        { id: 'in:0', title: 'Non merci' },
      ])
      expect(sendList).not.toHaveBeenCalled()
    })

    it('suppléments (5 dispo) → sendList (6 lignes, "Non merci" en dernier)', async () => {
      repo.getBotContext = vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: menuWithSupplements5,
      })
      repo.loadConversation = vi.fn().mockResolvedValue({ state: 'MENU', cart: EMPTY_CART })
      await process()('chan-uuid', webhookPayload('1'))

      expect(sendList).toHaveBeenCalledTimes(1)
      const [to, , buttonLabel, rows] = sendList.mock.calls[0]
      expect(to).toBe(CHAT_ID)
      expect(buttonLabel).toBe('Choisir')
      expect(rows).toHaveLength(6)
      expect(rows[rows.length - 1]).toEqual({ id: 'in:0', title: 'Non merci' })
      expect(sendQuickReplies).not.toHaveBeenCalled()
    })

    it('CONFIRMATION → boutons Oui (in:oui) / Annuler (in:annuler)', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({
        state: 'MODE',
        cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] },
      })
      await process()('chan-uuid', webhookPayload('3')) // sur_place = 3ᵉ mode (drive+livraison+sur_place)

      expect(sendQuickReplies).toHaveBeenCalledTimes(1)
      const [, , buttons] = sendQuickReplies.mock.calls[0]
      expect(buttons).toEqual([
        { id: 'in:oui', title: 'Oui' },
        { id: 'in:annuler', title: 'Annuler' },
      ])
    })

    it('échec de l’envoi interactif → repli texte avec le même corps, loggé', async () => {
      sendQuickReplies = vi.fn().mockRejectedValue(new Error('whapi 500'))
      repo.loadConversation = vi.fn().mockResolvedValue({
        state: 'MENU',
        cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] },
      })
      await process()('chan-uuid', webhookPayload('valider'))

      const expectedBody = copy.chooseMode(['🚗 Drive (retrait sur créneau)', '🛵 Livraison', '🥡 À emporter'])
      expect(sendQuickReplies).toHaveBeenCalledTimes(1)
      expect(sendText).toHaveBeenCalledWith(CHAT_ID, expectedBody)
      expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'out', CHAT_ID, expectedBody, 'OUT-TEXT')
    })

    it('flux texte pur (ACCUEIL/MENU) → aucun envoi interactif tenté', async () => {
      await process()('chan-uuid', webhookPayload('menu'))
      expect(sendQuickReplies).not.toHaveBeenCalled()
      expect(sendList).not.toHaveBeenCalled()
      expect(sendText).toHaveBeenCalled()
    })
  })

  describe('entrée interactive (message type "reply")', () => {
    it('reply avec id "in:2" → la machine reçoit "2"', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({
        state: 'MODE',
        cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] },
      })
      await process()('chan-uuid', replyPayload({
        type: 'buttons_reply', buttons_reply: { id: 'in:2', title: '🛵 Livraison' },
      }))

      // MODE + "2" → mode livraison → état ADRESSE (cf. machine.ts, case 'MODE').
      expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'ADRESSE', expect.anything())
      expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'in', CHAT_ID, '🛵 Livraison', 'MSG-REPLY')
    })

    it('reply titre "Non merci" (id in: perdu) en SUPPLEMENTS_CHECKOUT → décline et avance, pas de boucle', async () => {
      repo.getBotContext = vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: menuWithSupplements2,
      })
      repo.loadConversation = vi.fn().mockResolvedValue({
        state: 'SUPPLEMENTS_CHECKOUT',
        cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] },
      })
      // Tap "Non merci" revenu SANS l'id in:0 (round-trip perdu) → seul le titre est disponible.
      await process()('chan-uuid', replyPayload({
        type: 'buttons_reply', buttons_reply: { id: 'lost-id', title: 'Non merci' },
      }))

      // Décline → plus aucun item en attente de suppléments → passage à MODE (pas de re-prompt SUPPLEMENTS_CHECKOUT).
      expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'MODE', expect.anything())
    })

    it('reply titre "Œuf +300 F" (id in: perdu) en SUPPLEMENTS_CHECKOUT → ajoute le supplément', async () => {
      repo.getBotContext = vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: menuWithSupplements2,
      })
      repo.loadConversation = vi.fn().mockResolvedValue({
        state: 'SUPPLEMENTS_CHECKOUT',
        cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] },
      })
      await process()('chan-uuid', replyPayload({
        type: 'buttons_reply', buttons_reply: { id: 'lost-id', title: 'Œuf +300 F' },
      }))

      // Supplément ajouté → on redemande (reste SUPPLEMENTS_CHECKOUT) avec le supplément dans le panier.
      const call = (repo.saveConversation as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(call[2]).toBe('SUPPLEMENTS_CHECKOUT')
      expect(call[3].items[0].supplements).toEqual([{ id: 's1', name: 'Œuf', price: 300 }])
    })

    it('reply sans préfixe "in:" → le titre sert d’entrée machine', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({
        state: 'MENU',
        cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }] },
      })
      await process()('chan-uuid', replyPayload({
        type: 'buttons_reply', buttons_reply: { id: 'unrelated-id', title: 'annuler' },
      }))

      expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'ACCUEIL',
        expect.objectContaining({ items: [] }))
    })
  })

  describe('panier natif avec suppléments', () => {
    it('plat à suppléments → SUPPLEMENTS_CHECKOUT persisté, boutons envoyés (récap en texte + suppléments en interactif)', async () => {
      repo.getBotContext = vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: menuWithSupplements2,
      })
      getOrderItems.mockResolvedValue([{ retailer_id: 'i1', quantity: 1 }])

      await process()('chan-uuid', orderPayload('ORD-1'))

      expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'SUPPLEMENTS_CHECKOUT', expect.anything())
      // Récap panier : texte (1ère réponse, jamais interactive).
      expect(sendText).toHaveBeenCalledTimes(1)
      expect(sendText.mock.calls[0][1]).toMatch(/Votre panier/)
      // Question suppléments (dernière réponse) : interactive.
      expect(sendQuickReplies).toHaveBeenCalledTimes(1)
      const [, body, buttons] = sendQuickReplies.mock.calls[0]
      expect(body).toMatch(/Avec supplément pour Bo Bun/)
      expect(buttons).toEqual([
        { id: 'in:1', title: 'Œuf +300 F' },
        { id: 'in:2', title: 'Bœuf +1000 F' },
        { id: 'in:0', title: 'Non merci' },
      ])
    })
  })
})
