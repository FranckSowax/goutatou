import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'

function payload(body: string) {
  return {
    messages: [{ id: 'M-' + body, from_me: false, type: 'text', chat_id: '24177000001@s.whatsapp.net',
      from: '24177000001', from_name: 'Client', text: { body } }],
    channel_id: 'CH',
  }
}

describe('processor opt-out', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>
  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT' })
    repo = {
      getChannel: vi.fn().mockResolvedValue({ channelUuid: 'c', restaurantId: 'r1', restaurantName: 'X', token: 't', driveEnabled: true }),
      getBotContext: vi.fn().mockResolvedValue({ restaurantName: 'X', driveEnabled: true, driveSlots: [], menu: { categories: [] } }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust1' }),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn(),
      logMessage: vi.fn().mockResolvedValue(true),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
    }
  })

  it('mot-clé STOP → setOptedOut + confirmation, pas de transition', async () => {
    const process = createProcessor(repo, () => ({ sendText }))
    await process('c', payload('STOP'))
    expect(repo.setOptedOut).toHaveBeenCalledWith('r1', 'cust1')
    expect(sendText).toHaveBeenCalledWith('24177000001@s.whatsapp.net', expect.stringContaining('désabonné'))
    expect(repo.loadConversation).not.toHaveBeenCalled()
  })

  it('message normal → pas de setOptedOut', async () => {
    const process = createProcessor(repo, () => ({ sendText }))
    await process('c', payload('menu'))
    expect(repo.setOptedOut).not.toHaveBeenCalled()
  })
})
