import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor, type ProcessorDeps } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'
import { copy } from '../src/bot/copy.js'

const CHAT_ID = '24177000001@s.whatsapp.net'

// Shape confirmée support.whapi.cloud/help-desk/receiving/webhooks/incoming-webhooks-format/
// incoming-message : messages[n].type === 'order', messages[n].order.order_id.
function orderPayload(orderId: string | null = 'ORD-1', overrides: Record<string, unknown> = {}) {
  return {
    messages: [{
      id: 'MSG-ORDER', from_me: false, type: 'order',
      chat_id: CHAT_ID, from: '24177000001', from_name: 'Client',
      order: orderId === null ? {} : { order_id: orderId, token: 'ord-tok-b64' },
      ...overrides,
    }],
    channel_id: 'CH',
  }
}

describe('processor — panier WhatsApp natif entrant (message type "order")', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>
  let getOrderItems: ReturnType<typeof vi.fn>
  let deps: ProcessorDeps

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-TEXT' })
    getOrderItems = vi.fn()
    deps = { sleep: vi.fn().mockResolvedValue(undefined), sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 8 }
    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true, catalogEnabled: true,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: { categories: [{ name: 'Plats', items: [
          { id: 'i1', name: 'Bo Bun', price: 4500 },
          { id: 'i2', name: 'Nems', price: 2500 },
        ] }] },
      }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust-1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      setMarketingOptIn: vi.fn().mockResolvedValue(undefined),
      getWheelInfo: vi.fn().mockResolvedValue({ enabled: false, triggerOrders: 5, orderCount: 0 }),
      hasWaProducts: vi.fn().mockResolvedValue(true),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      logMessage: vi.fn().mockResolvedValue(true),
    }
  })

  function process() {
    return createProcessor(repo, () => ({
      sendText,
      sendImage: vi.fn().mockResolvedValue({ id: 'OUT-IMG' }),
      sendCatalog: vi.fn().mockResolvedValue({ id: 'OUT-CATALOG' }),
      getOrderItems,
      sendTyping: vi.fn().mockResolvedValue(undefined),
      markAsRead: vi.fn().mockResolvedValue(undefined),
      react: vi.fn().mockResolvedValue(undefined),
      sendLocation: vi.fn().mockResolvedValue(undefined),
    }), deps)
  }

  it('panier heureux : items connus → MODE persisté, prix/nom depuis la base (pas le webhook)', async () => {
    getOrderItems.mockResolvedValue([
      { retailer_id: 'i1', quantity: 2, price: 1 }, // prix webhook volontairement absurde
      { retailer_id: 'i2', quantity: 1, price: 999999 },
    ])
    await process()('chan-uuid', orderPayload('ORD-1'))

    const expectedCart = {
      items: [
        { menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 2, supplements: [] },
        { menuItemId: 'i2', name: 'Nems', unitPrice: 2500, qty: 1, supplements: [] },
      ],
    }
    expect(getOrderItems).toHaveBeenCalledWith('ORD-1', 'ord-tok-b64')
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'MODE', expectedCart)
    // Récap + question mode envoyés (comme une transition normale), texte byte-identique
    // aux helpers copy.cartRecap/copy.chooseMode (mêmes textes que le flux "valider").
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText.mock.calls[0]).toEqual([CHAT_ID, copy.cartRecap(expectedCart)])
    expect(sendText.mock.calls[1]).toEqual([
      CHAT_ID, copy.chooseMode(['🚗 Drive (retrait sur créneau)', '🛵 Livraison', '🍽️ Sur place']),
    ])
    expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'in', CHAT_ID, '🛒 Panier WhatsApp', 'MSG-ORDER')
  })

  it('items inconnus/indisponibles droppés silencieusement, connus conservés', async () => {
    getOrderItems.mockResolvedValue([
      { retailer_id: 'i1', quantity: 1 },
      { retailer_id: 'inconnu-999', quantity: 3 },
      { retailer_id: undefined, quantity: 2 },
    ])
    await process()('chan-uuid', orderPayload('ORD-2'))
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'MODE', {
      items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1, supplements: [] }],
    })
  })

  it('tous les items inconnus/indisponibles → message FR, pas de saveConversation', async () => {
    getOrderItems.mockResolvedValue([{ retailer_id: 'inconnu', quantity: 1 }])
    await process()('chan-uuid', orderPayload('ORD-3'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, 'Ces articles ne sont plus disponibles — tapez *menu* pour voir la carte.')
    expect(repo.saveConversation).not.toHaveBeenCalled()
  })

  it('panier vide (aucun item dans la réponse) → message FR, pas de saveConversation', async () => {
    getOrderItems.mockResolvedValue([])
    await process()('chan-uuid', orderPayload('ORD-4'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, 'Ces articles ne sont plus disponibles — tapez *menu* pour voir la carte.')
    expect(repo.saveConversation).not.toHaveBeenCalled()
  })

  it('getOrderItems échoue → message FR générique, pas de crash', async () => {
    getOrderItems.mockRejectedValue(new Error('whapi 500'))
    await expect(process()('chan-uuid', orderPayload('ORD-5'))).resolves.toBeUndefined()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Nous n'avons pas pu lire votre panier — tapez *menu* pour commander.")
    expect(repo.saveConversation).not.toHaveBeenCalled()
  })

  it('order.order_id absent du webhook → message FR générique, getOrderItems jamais appelé', async () => {
    await process()('chan-uuid', orderPayload(null))
    expect(getOrderItems).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Nous n'avons pas pu lire votre panier — tapez *menu* pour commander.")
  })

  it('idempotence : message order déjà loggé → aucun traitement', async () => {
    repo.logMessage = vi.fn().mockResolvedValue(false)
    await process()('chan-uuid', orderPayload('ORD-6'))
    expect(getOrderItems).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
  })
})
