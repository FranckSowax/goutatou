import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'

function webhookPayload(body: string, overrides: Record<string, unknown> = {}) {
  return {
    messages: [{
      id: 'MSG-' + body,
      from_me: false,
      type: 'text',
      chat_id: '24177000001@s.whatsapp.net',
      from: '24177000001',
      from_name: 'Client Test',
      text: { body },
      ...overrides,
    }],
    channel_id: 'WHAPI-CHAN',
  }
}

describe('processor', () => {
  let repo: BotRepo
  let sendText: ReturnType<typeof vi.fn>

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-1' })
    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: { categories: [{ name: 'Plats', items: [{ id: 'i1', name: 'Bo Bun', price: 4500 }] }] },
      }),
      upsertCustomer: vi.fn().mockResolvedValue({ id: 'cust-1' }),
      setOptedOut: vi.fn().mockResolvedValue(undefined),
      loadConversation: vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART }),
      saveConversation: vi.fn().mockResolvedValue(undefined),
      createOrder: vi.fn().mockResolvedValue({ orderNumber: 42, total: 4500 }),
      logMessage: vi.fn().mockResolvedValue(true),
    }
  })

  it('message "menu" → répond la carte au chat_id, sauve l’état MENU', async () => {
    const process = createProcessor(repo, () => ({ sendText }))
    await process('chan-uuid', webhookPayload('menu'))
    expect(sendText).toHaveBeenCalledWith('24177000001@s.whatsapp.net', expect.stringContaining('Bo Bun'))
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'MENU', expect.anything())
  })

  it('ignore from_me et les types non-text', async () => {
    const process = createProcessor(repo, () => ({ sendText }))
    await process('chan-uuid', webhookPayload('menu', { from_me: true }))
    await process('chan-uuid', webhookPayload('menu', { type: 'image' }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('canal inconnu → aucun envoi, pas de crash', async () => {
    repo.getChannel = vi.fn().mockResolvedValue(null)
    const process = createProcessor(repo, () => ({ sendText }))
    await process('unknown', webhookPayload('menu'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('message déjà traité (dédup) → skip', async () => {
    repo.logMessage = vi.fn().mockResolvedValue(false)
    const process = createProcessor(repo, () => ({ sendText }))
    await process('chan-uuid', webhookPayload('menu'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('confirmation → crée la commande, vide le panier, envoie le numéro', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({
      state: 'CONFIRMATION',
      cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }], mode: 'drive', driveSlotId: 's1', driveSlotLabel: '12h00' },
    })
    const process = createProcessor(repo, () => ({ sendText }))
    await process('chan-uuid', webhookPayload('1'))
    expect(repo.createOrder).toHaveBeenCalledWith('resto-1', 'cust-1', expect.objectContaining({ mode: 'drive' }))
    expect(sendText).toHaveBeenCalledWith('24177000001@s.whatsapp.net', expect.stringContaining('n°42'))
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'ACCUEIL',
      expect.objectContaining({ items: [] }))
  })

  it('erreur de traitement d’un message → message de secours envoyé, pas de crash', async () => {
    repo.upsertCustomer = vi.fn().mockRejectedValue(new Error('db down'))
    const process = createProcessor(repo, () => ({ sendText }))
    await expect(process('chan-uuid', webhookPayload('menu'))).resolves.toBeUndefined()
    expect(sendText).toHaveBeenCalledWith('24177000001@s.whatsapp.net', expect.stringContaining('souci technique'))
  })

  it('échec d’envoi Whapi → loggé en message_logs, pas de crash', async () => {
    sendText = vi.fn().mockRejectedValue(new Error('whapi 500'))
    const process = createProcessor(repo, () => ({ sendText }))
    await expect(process('chan-uuid', webhookPayload('menu'))).resolves.toBeUndefined()
    expect(repo.logMessage).toHaveBeenCalledWith(
      expect.anything(), 'out', expect.any(String), expect.any(String), undefined, expect.any(String),
    )
  })
})
