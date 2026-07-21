import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor, type ProcessorDeps } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'
import { MEDIA_COPY, mediaThrottle } from '../src/bot/media.js'

const deps: ProcessorDeps = {
  sleep: vi.fn().mockResolvedValue(undefined),
  sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 0,
}

const CHAT_ID = '24177000009@s.whatsapp.net'

function mediaPayload(id: string, type: string, overrides: Record<string, unknown> = {}) {
  return {
    messages: [{
      id,
      from_me: false,
      type,
      chat_id: CHAT_ID,
      from: '24177000009',
      from_name: 'Client Vocal',
      ...overrides,
    }],
    channel_id: 'WHAPI-CHAN',
  }
}

describe('processor — médias non pris en charge (note vocale, image…)', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>
  let sendImage: ReturnType<typeof vi.fn>
  let sendTyping: ReturnType<typeof vi.fn>
  let markAsRead: ReturnType<typeof vi.fn>
  let react: ReturnType<typeof vi.fn>
  let sendLocation: ReturnType<typeof vi.fn>

  function process() {
    return createProcessor(repo, () => ({ sendText, sendImage, sendTyping, markAsRead, react, sendLocation }), deps)
  }

  beforeEach(() => {
    mediaThrottle.reset()
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-1' })
    sendImage = vi.fn().mockResolvedValue({ id: 'OUT-IMG' })
    sendTyping = vi.fn().mockResolvedValue(undefined)
    markAsRead = vi.fn().mockResolvedValue(undefined)
    react = vi.fn().mockResolvedValue(undefined)
    sendLocation = vi.fn().mockResolvedValue({ id: 'OUT-LOC' })
    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
        menu: { categories: [] },
      }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust-1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      setMarketingOptIn: vi.fn().mockResolvedValue(undefined),
      getWheelInfo: vi.fn().mockResolvedValue({ enabled: false, triggerOrders: 5, orderCount: 0 }),
      getLoyaltyEnabled: vi.fn().mockResolvedValue(false),
      hasWaProducts: vi.fn().mockResolvedValue(false),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn().mockResolvedValue({ orderNumber: 42, total: 4500 }),
      logMessage: vi.fn().mockResolvedValue(true),
    } as unknown as BotRepo
  })

  it('note vocale (ptt) → réponse chaleureuse au lieu du silence', async () => {
    await process()('chan-uuid', mediaPayload('MSG-PTT', 'ptt'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, MEDIA_COPY.voice)
  })

  it('note vocale type "audio" → même réponse', async () => {
    await process()('chan-uuid', mediaPayload('MSG-AUDIO', 'audio'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, MEDIA_COPY.voice)
  })

  it('image → variante image/fichier', async () => {
    await process()('chan-uuid', mediaPayload('MSG-IMG', 'image'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, MEDIA_COPY.media)
  })

  it('entrée loggée (message_logs) puis réponse loggée en sortie', async () => {
    await process()('chan-uuid', mediaPayload('MSG-PTT', 'ptt'))
    expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'in', CHAT_ID, '🎤 Note vocale', 'MSG-PTT')
    expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'out', CHAT_ID, MEDIA_COPY.voice, 'OUT-1')
  })

  it('from_me (le restaurant envoie un vocal) → aucun envoi, aucun log', async () => {
    await process()('chan-uuid', mediaPayload('MSG-PTT', 'ptt', { from_me: true }))
    expect(sendText).not.toHaveBeenCalled()
    expect(repo.logMessage).not.toHaveBeenCalled()
  })

  it('état HUMAIN → silence total (le restaurateur écoutera le vocal lui-même)', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({ state: 'HUMAIN', cart: EMPTY_CART })
    await process()('chan-uuid', mediaPayload('MSG-PTT', 'ptt'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('webhook redélivré (même id → logMessage false) → pas de seconde réponse', async () => {
    repo.logMessage = vi.fn().mockResolvedValue(false)
    await process()('chan-uuid', mediaPayload('MSG-PTT', 'ptt'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('5 vocaux d’affilée → UNE seule réponse (anti-spam par chat)', async () => {
    const run = process()
    for (let i = 0; i < 5; i++) {
      await run('chan-uuid', mediaPayload(`MSG-PTT-${i}`, 'ptt'))
    }
    expect(sendText).toHaveBeenCalledTimes(1)
  })

  it('anti-spam scopé par chat : un autre client reçoit bien sa réponse', async () => {
    const run = process()
    await run('chan-uuid', mediaPayload('MSG-A', 'ptt'))
    await run('chan-uuid', mediaPayload('MSG-B', 'ptt', {
      chat_id: '24166000002@s.whatsapp.net', from: '24166000002',
    }))
    expect(sendText).toHaveBeenCalledTimes(2)
  })

  it('type technique inconnu (system) → silence, comme avant', async () => {
    await process()('chan-uuid', mediaPayload('MSG-SYS', 'system'))
    expect(sendText).not.toHaveBeenCalled()
    expect(repo.logMessage).not.toHaveBeenCalled()
  })

  it('aucune conversation n’est écrite pour un média (pas de saveConversation)', async () => {
    await process()('chan-uuid', mediaPayload('MSG-PTT', 'ptt'))
    expect(repo.saveConversation).not.toHaveBeenCalled()
  })
})

describe('processor — mot-clé « où en est ma commande »', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>
  let getActiveOrder: ReturnType<typeof vi.fn>

  function textPayload(body: string) {
    return {
      messages: [{
        id: `MSG-${body}`, from_me: false, type: 'text', chat_id: CHAT_ID,
        from: '24177000009', from_name: 'Client', text: { body },
      }],
      channel_id: 'WHAPI-CHAN',
    }
  }

  function process() {
    return createProcessor(repo, () => ({
      sendText,
      sendImage: vi.fn().mockResolvedValue({ id: 'OUT-IMG' }),
      sendTyping: vi.fn().mockResolvedValue(undefined),
      markAsRead: vi.fn().mockResolvedValue(undefined),
      react: vi.fn().mockResolvedValue(undefined),
      sendLocation: vi.fn().mockResolvedValue({ id: 'OUT-LOC' }),
    }), deps)
  }

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-1' })
    getActiveOrder = vi.fn().mockResolvedValue({
      orderNumber: 42, status: 'en_preparation', mode: 'drive', total: 9000,
    })
    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
        menu: { categories: [{ name: 'Plats', items: [{ id: 'i1', name: 'Bo Bun', price: 4500 }] }] },
      }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust-1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      setMarketingOptIn: vi.fn().mockResolvedValue(undefined),
      getWheelInfo: vi.fn().mockResolvedValue({ enabled: false, triggerOrders: 5, orderCount: 0 }),
      getLoyaltyEnabled: vi.fn().mockResolvedValue(false),
      hasWaProducts: vi.fn().mockResolvedValue(false),
      getActiveOrder,
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn().mockResolvedValue({ orderNumber: 42, total: 4500 }),
      logMessage: vi.fn().mockResolvedValue(true),
    } as unknown as BotRepo
  })

  it('injecte la commande active dans le contexte et répond son statut', async () => {
    await process()('chan-uuid', textPayload('où en est ma commande'))
    expect(getActiveOrder).toHaveBeenCalledWith('resto-1', 'cust-1')
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('n°42'))
  })

  it('aucune commande active → message doux', async () => {
    getActiveOrder.mockResolvedValue(null)
    await process()('chan-uuid', textPayload('statut'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining("pas de commande en cours"))
  })

  it('message ordinaire → AUCUNE requête commande active (pas de coût par message)', async () => {
    await process()('chan-uuid', textPayload('menu'))
    expect(getActiveOrder).not.toHaveBeenCalled()
  })

  it('état HUMAIN → pas de requête et aucune réponse', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({ state: 'HUMAIN', cart: EMPTY_CART })
    await process()('chan-uuid', textPayload('ma commande'))
    expect(getActiveOrder).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
  })

  it('repo sans getActiveOrder (déploiement/test historique) → message doux, jamais de crash', async () => {
    delete (repo as { getActiveOrder?: unknown }).getActiveOrder
    await process()('chan-uuid', textPayload('suivi'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining("pas de commande en cours"))
  })
})
