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

function menuWith(items: { id: string; name: string; price: number; photoUrl?: string | null }[]) {
  return { categories: [{ name: 'Plats', items }] }
}

describe('processor — photos du menu', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>
  let sendImage: ReturnType<typeof vi.fn>
  let sleep: ReturnType<typeof vi.fn>
  let deps: ProcessorDeps

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-TEXT' })
    sendImage = vi.fn().mockResolvedValue({ id: 'OUT-IMG' })
    sleep = vi.fn().mockResolvedValue(undefined)
    deps = { sleep, sendDelayMinMs: 100, sendDelayMaxMs: 100, menuPhotosMax: 8 }
    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
        menu: menuWith([{ id: 'i1', name: 'Bo Bun', price: 4500 }]),
      }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust-1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      setMarketingOptIn: vi.fn().mockResolvedValue(undefined),
      getWheelInfo: vi.fn().mockResolvedValue({ enabled: false, triggerOrders: 5, orderCount: 0 }),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      logMessage: vi.fn().mockResolvedValue(true),
    }
  })

  function process() {
    return createProcessor(repo, () => ({
      sendText, sendImage,
      sendTyping: vi.fn().mockResolvedValue(undefined),
      markAsRead: vi.fn().mockResolvedValue(undefined),
      react: vi.fn().mockResolvedValue(undefined),
      sendLocation: vi.fn().mockResolvedValue(undefined),
    }), deps)
  }

  it('menu sans photos → aucun sendImage (non-régression)', async () => {
    await process()('chan-uuid', payload('menu'))
    expect(sendImage).not.toHaveBeenCalled()
  })

  it('3 plats avec photos → 3 sendImage, ordre du menu, légendes correctes', async () => {
    repo.getBotContext = vi.fn().mockResolvedValue({
      restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
      menu: menuWith([
        { id: 'i1', name: 'Bo Bun', price: 4500, photoUrl: 'https://cdn.example.com/i1.jpg' },
        { id: 'i2', name: 'Nems', price: 2500, photoUrl: 'https://cdn.example.com/i2.jpg' },
        { id: 'i3', name: 'Pho', price: 5000, photoUrl: 'https://cdn.example.com/i3.jpg' },
      ]),
    })
    await process()('chan-uuid', payload('menu'))
    expect(sendImage).toHaveBeenCalledTimes(3)
    expect(sendImage).toHaveBeenNthCalledWith(1, CHAT_ID, 'https://cdn.example.com/i1.jpg', 'Bo Bun — 4 500 FCFA')
    expect(sendImage).toHaveBeenNthCalledWith(2, CHAT_ID, 'https://cdn.example.com/i2.jpg', 'Nems — 2 500 FCFA')
    expect(sendImage).toHaveBeenNthCalledWith(3, CHAT_ID, 'https://cdn.example.com/i3.jpg', 'Pho — 5 000 FCFA')
    expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'out', CHAT_ID, 'Bo Bun — 4 500 FCFA', 'OUT-IMG')
  })

  it('cap à menuPhotosMax', async () => {
    deps.menuPhotosMax = 2
    repo.getBotContext = vi.fn().mockResolvedValue({
      restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
      menu: menuWith([
        { id: 'i1', name: 'A', price: 1000, photoUrl: 'https://cdn.example.com/a.jpg' },
        { id: 'i2', name: 'B', price: 1000, photoUrl: 'https://cdn.example.com/b.jpg' },
        { id: 'i3', name: 'C', price: 1000, photoUrl: 'https://cdn.example.com/c.jpg' },
      ]),
    })
    await process()('chan-uuid', payload('menu'))
    expect(sendImage).toHaveBeenCalledTimes(2)
  })

  it('plats indisponibles/sans photo exclus', async () => {
    repo.getBotContext = vi.fn().mockResolvedValue({
      restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
      // Le repo ne fournit déjà que les plats disponibles (filtrage en amont) : ici on
      // vérifie que le processor exclut en plus ceux sans photoUrl (undefined ou null).
      menu: menuWith([
        { id: 'i1', name: 'A', price: 1000, photoUrl: 'https://cdn.example.com/a.jpg' },
        { id: 'i2', name: 'B', price: 1000 },
        { id: 'i3', name: 'C', price: 1000, photoUrl: null },
      ]),
    })
    await process()('chan-uuid', payload('menu'))
    expect(sendImage).toHaveBeenCalledTimes(1)
    expect(sendImage).toHaveBeenCalledWith(CHAT_ID, 'https://cdn.example.com/a.jpg', expect.any(String))
  })

  it('échec sendImage sur un plat → les suivants partent quand même, pas de throw', async () => {
    repo.getBotContext = vi.fn().mockResolvedValue({
      restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
      menu: menuWith([
        { id: 'i1', name: 'A', price: 1000, photoUrl: 'https://cdn.example.com/a.jpg' },
        { id: 'i2', name: 'B', price: 1000, photoUrl: 'https://cdn.example.com/b.jpg' },
      ]),
    })
    sendImage.mockRejectedValueOnce(new Error('whapi 500')).mockResolvedValueOnce({ id: 'OUT-2' })
    await expect(process()('chan-uuid', payload('menu'))).resolves.toBeUndefined()
    expect(sendImage).toHaveBeenCalledTimes(2)
  })

  it('sleep appelé entre les envois, pas après le dernier', async () => {
    repo.getBotContext = vi.fn().mockResolvedValue({
      restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
      menu: menuWith([
        { id: 'i1', name: 'A', price: 1000, photoUrl: 'https://cdn.example.com/a.jpg' },
        { id: 'i2', name: 'B', price: 1000, photoUrl: 'https://cdn.example.com/b.jpg' },
        { id: 'i3', name: 'C', price: 1000, photoUrl: 'https://cdn.example.com/c.jpg' },
      ]),
    })
    await process()('chan-uuid', payload('menu'))
    expect(sendImage).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('commande non "menu" (ex: état HUMAIN avalant "menu") → aucune photo envoyée', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({ state: 'HUMAIN', cart: EMPTY_CART })
    repo.getBotContext = vi.fn().mockResolvedValue({
      restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
      menu: menuWith([{ id: 'i1', name: 'A', price: 1000, photoUrl: 'https://cdn.example.com/a.jpg' }]),
    })
    await process()('chan-uuid', payload('menu'))
    expect(sendImage).not.toHaveBeenCalled()
  })
})
