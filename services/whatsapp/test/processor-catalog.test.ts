import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor, type ProcessorDeps } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'

const CHAT_ID = '24177000001@s.whatsapp.net'

function payload(body = 'menu') {
  return {
    messages: [{
      id: 'MSG-' + body, from_me: false, type: 'text',
      chat_id: CHAT_ID, from: '24177000001', from_name: 'Client',
      text: { body },
    }],
    channel_id: 'CH',
  }
}

describe('processor — carte catalogue vs photos du menu', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>
  let sendImage: ReturnType<typeof vi.fn>
  let sendCatalog: ReturnType<typeof vi.fn>
  let getOrderItems: ReturnType<typeof vi.fn>
  let deps: ProcessorDeps

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-TEXT' })
    sendImage = vi.fn().mockResolvedValue({ id: 'OUT-IMG' })
    sendCatalog = vi.fn().mockResolvedValue({ id: 'OUT-CATALOG' })
    getOrderItems = vi.fn()
    deps = { sleep: vi.fn().mockResolvedValue(undefined), sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 8 }
    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true, catalogEnabled: false,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
        menu: { categories: [{ name: 'Plats', items: [
          { id: 'i1', name: 'Bo Bun', price: 4500, photoUrl: 'https://cdn.example.com/i1.jpg' },
        ] }] },
      }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust-1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      setMarketingOptIn: vi.fn().mockResolvedValue(undefined),
      getWheelInfo: vi.fn().mockResolvedValue({ enabled: false, triggerOrders: 5, orderCount: 0 }),
      hasWaProducts: vi.fn().mockResolvedValue(false),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      logMessage: vi.fn().mockResolvedValue(true),
    }
  })

  function process() {
    return createProcessor(repo, () => ({
      sendText, sendImage, sendCatalog, getOrderItems,
      sendTyping: vi.fn().mockResolvedValue(undefined),
      markAsRead: vi.fn().mockResolvedValue(undefined),
      react: vi.fn().mockResolvedValue(undefined),
      sendLocation: vi.fn().mockResolvedValue(undefined),
    }), deps)
  }

  it('catalog_enabled=false → photos comme aujourd\'hui, pas de sendCatalog (non-régression)', async () => {
    await process()('chan-uuid', payload('menu'))
    expect(sendImage).toHaveBeenCalledTimes(1)
    expect(sendCatalog).not.toHaveBeenCalled()
  })

  it('catalog_enabled=true mais aucun plat synchronisé (hasWaProducts=false) → repli photos', async () => {
    repo.getChannel = vi.fn().mockResolvedValue({
      channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
      token: 'tok', driveEnabled: true, catalogEnabled: true,
    })
    repo.hasWaProducts = vi.fn().mockResolvedValue(false)
    await process()('chan-uuid', payload('menu'))
    expect(sendImage).toHaveBeenCalledTimes(1)
    expect(sendCatalog).not.toHaveBeenCalled()
  })

  it('catalog_enabled=true ET hasWaProducts=true → sendCatalog après le texte, PAS de photos', async () => {
    repo.getChannel = vi.fn().mockResolvedValue({
      channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
      token: 'tok', driveEnabled: true, catalogEnabled: true,
    })
    repo.hasWaProducts = vi.fn().mockResolvedValue(true)
    await process()('chan-uuid', payload('menu'))
    expect(sendCatalog).toHaveBeenCalledTimes(1)
    expect(sendCatalog).toHaveBeenCalledWith(CHAT_ID)
    expect(sendImage).not.toHaveBeenCalled()
    expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'out', CHAT_ID, '🛍️ Catalogue envoyé', 'OUT-CATALOG')
  })

  it('sendCatalog en échec → best-effort, pas de crash, pas de repli photos', async () => {
    repo.getChannel = vi.fn().mockResolvedValue({
      channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
      token: 'tok', driveEnabled: true, catalogEnabled: true,
    })
    repo.hasWaProducts = vi.fn().mockResolvedValue(true)
    sendCatalog.mockRejectedValueOnce(new Error('whapi 500'))
    await expect(process()('chan-uuid', payload('menu'))).resolves.toBeUndefined()
    expect(sendImage).not.toHaveBeenCalled()
  })

  it('hasWaProducts en échec → repli photos (comportement défensif)', async () => {
    repo.getChannel = vi.fn().mockResolvedValue({
      channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
      token: 'tok', driveEnabled: true, catalogEnabled: true,
    })
    repo.hasWaProducts = vi.fn().mockRejectedValue(new Error('db down'))
    await expect(process()('chan-uuid', payload('menu'))).resolves.toBeUndefined()
    expect(sendCatalog).not.toHaveBeenCalled()
    expect(sendImage).toHaveBeenCalledTimes(1)
  })
})
