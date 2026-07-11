import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor, type ProcessorDeps } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'

const deps: ProcessorDeps = {
  sleep: vi.fn().mockResolvedValue(undefined),
  sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 8,
}

const CHAT_ID = '24177000001@s.whatsapp.net'

function payload(body: string) {
  return {
    messages: [{
      id: 'M-' + body, from_me: false, type: 'text',
      chat_id: CHAT_ID, from: '24177000001', from_name: 'Client', text: { body },
    }],
    channel_id: 'CH',
  }
}

describe('processor — mot-clé "promos" (opt-in marketing)', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT' })
    repo = {
      getChannel: vi.fn().mockResolvedValue({ channelUuid: 'c', restaurantId: 'r1', restaurantName: 'X', token: 't', driveEnabled: true }),
      getBotContext: vi.fn().mockResolvedValue({ restaurantName: 'X', driveEnabled: true, driveSlots: [], menu: { categories: [] } }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      setMarketingOptIn: vi.fn().mockResolvedValue(undefined),
      getWheelInfo: vi.fn().mockResolvedValue({ enabled: false, triggerOrders: 5, orderCount: 0 }),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      logMessage: vi.fn().mockResolvedValue(true),
    }
  })

  it('mot-clé promos → setMarketingOptIn appelé + réponse envoyée', async () => {
    const process = createProcessor(repo, () => ({ sendText, sendImage: vi.fn() }), deps)
    await process('c', payload('promos'))
    expect(repo.setMarketingOptIn).toHaveBeenCalledWith('r1', 'cust1')
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining(`C'est noté`))
  })

  it('message normal (ex: menu) → pas de setMarketingOptIn', async () => {
    const process = createProcessor(repo, () => ({ sendText, sendImage: vi.fn() }), deps)
    await process('c', payload('menu'))
    expect(repo.setMarketingOptIn).not.toHaveBeenCalled()
  })

  it('état HUMAIN → "promos" avalé silencieusement, pas de setMarketingOptIn', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({ state: 'HUMAIN', cart: EMPTY_CART })
    const process = createProcessor(repo, () => ({ sendText, sendImage: vi.fn() }), deps)
    await process('c', payload('promos'))
    expect(repo.setMarketingOptIn).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
  })

  it('setMarketingOptIn échoue → best-effort, la réponse part quand même, pas de crash', async () => {
    repo.setMarketingOptIn = vi.fn().mockRejectedValue(new Error('db down'))
    const process = createProcessor(repo, () => ({ sendText, sendImage: vi.fn() }), deps)
    await expect(process('c', payload('promos'))).resolves.toBeUndefined()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining(`C'est noté`))
  })
})

describe('processor — mot-clé "roue" (contexte progression)', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT' })
    repo = {
      getChannel: vi.fn().mockResolvedValue({ channelUuid: 'c', restaurantId: 'r1', restaurantName: 'X', token: 't', driveEnabled: true }),
      getBotContext: vi.fn().mockResolvedValue({ restaurantName: 'X', driveEnabled: true, driveSlots: [], menu: { categories: [] } }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      setMarketingOptIn: vi.fn().mockResolvedValue(undefined),
      getWheelInfo: vi.fn().mockResolvedValue({ enabled: true, triggerOrders: 5, orderCount: 2 }),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      logMessage: vi.fn().mockResolvedValue(true),
    }
  })

  it('mot-clé roue → getWheelInfo appelé et progression injectée dans la réponse', async () => {
    const process = createProcessor(repo, () => ({ sendText, sendImage: vi.fn() }), deps)
    await process('c', payload('roue'))
    expect(repo.getWheelInfo).toHaveBeenCalledWith('r1', 'cust1')
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('Plus que 3 commandes avant votre tour de roue !'))
  })

  it('message normal (ex: menu) → pas d’appel getWheelInfo (chargé uniquement sur "roue")', async () => {
    const process = createProcessor(repo, () => ({ sendText, sendImage: vi.fn() }), deps)
    await process('c', payload('menu'))
    expect(repo.getWheelInfo).not.toHaveBeenCalled()
  })

  it('état HUMAIN → "roue" avalé silencieusement, pas d’appel getWheelInfo', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({ state: 'HUMAIN', cart: EMPTY_CART })
    const process = createProcessor(repo, () => ({ sendText, sendImage: vi.fn() }), deps)
    await process('c', payload('roue'))
    expect(repo.getWheelInfo).not.toHaveBeenCalled()
    expect(sendText).not.toHaveBeenCalled()
  })
})
