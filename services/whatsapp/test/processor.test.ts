import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor, type ProcessorDeps } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'

const deps: ProcessorDeps = {
  sleep: vi.fn().mockResolvedValue(undefined),
  sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 8,
}

const CHAT_ID = '24177000001@s.whatsapp.net'

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

function locationPayload(lat: number, lng: number, overrides: Record<string, unknown> = {}) {
  return {
    messages: [{
      id: 'MSG-LOC',
      from_me: false,
      type: 'location',
      chat_id: CHAT_ID,
      from: '24177000001',
      from_name: 'Client Test',
      location: { latitude: lat, longitude: lng },
      ...overrides,
    }],
    channel_id: 'WHAPI-CHAN',
  }
}

describe('processor', () => {
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
        restaurantName: 'Chez Test', driveEnabled: true,
        driveSlots: [{ id: 's1', label: '12h00' }],
        menu: { categories: [{ name: 'Plats', items: [{ id: 'i1', name: 'Bo Bun', price: 4500 }] }] },
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

  it('message "menu" → répond la carte au chat_id, sauve l’état MENU', async () => {
    await process()('chan-uuid', webhookPayload('menu'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('Bo Bun'))
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'MENU', expect.anything())
  })

  it('ignore from_me et les types non-text/non-location', async () => {
    await process()('chan-uuid', webhookPayload('menu', { from_me: true }))
    await process()('chan-uuid', webhookPayload('menu', { type: 'image' }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('canal inconnu → aucun envoi, pas de crash', async () => {
    repo.getChannel = vi.fn().mockResolvedValue(null)
    await process()('unknown', webhookPayload('menu'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('message déjà traité (dédup) → skip', async () => {
    repo.logMessage = vi.fn().mockResolvedValue(false)
    await process()('chan-uuid', webhookPayload('menu'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('confirmation → crée la commande, vide le panier, envoie le numéro, réagit ✅', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({
      state: 'CONFIRMATION',
      cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }], mode: 'drive', driveSlotId: 's1', driveSlotLabel: '12h00' },
    })
    await process()('chan-uuid', webhookPayload('1'))
    expect(repo.createOrder).toHaveBeenCalledWith('resto-1', 'cust-1', expect.objectContaining({ mode: 'drive' }))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('n°42'))
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'ACCUEIL',
      expect.objectContaining({ items: [] }))
    expect(react).toHaveBeenCalledWith('MSG-1', '✅')
  })

  it('create_order rejette duplicate_order → message doux (pas de « Oups »), panier vidé, pas de ✅', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({
      state: 'CONFIRMATION',
      cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }], mode: 'sur_place' },
    })
    // Le repo enrobe l'erreur rpc : `create_order: <message Postgres>` (cf. repo.ts createOrder).
    repo.createOrder = vi.fn().mockRejectedValue(new Error('create_order: duplicate_order'))
    await expect(process()('chan-uuid', webhookPayload('1'))).resolves.toBeUndefined()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, '✅ Votre commande est déjà enregistrée — un instant !')
    expect(sendText).not.toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('souci technique'))
    expect(react).not.toHaveBeenCalled()
    // Reset panier/état comme après une création réussie : le client a (ou va recevoir) la
    // vraie confirmation via l'autre traitement.
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'ACCUEIL',
      expect.objectContaining({ items: [] }))
  })

  it('deux webhooks concurrents du même client → traitements sérialisés (load→save avant le load suivant)', async () => {
    const events: string[] = []
    let firstLoad = true
    repo.loadConversation = vi.fn().mockImplementation(async () => {
      events.push('load')
      // Le premier load traîne : sans mutex, le second load partirait AVANT le premier save.
      if (firstLoad) { firstLoad = false; await new Promise((r) => setTimeout(r, 20)) }
      return { state: 'ACCUEIL', cart: EMPTY_CART }
    })
    repo.saveConversation = vi.fn().mockImplementation(async () => { events.push('save') })
    const p = process()
    await Promise.all([
      p('chan-uuid', webhookPayload('menu')),
      p('chan-uuid', webhookPayload('promos')),
    ])
    expect(events).toEqual(['load', 'save', 'load', 'save'])
  })

  it('confirmation dont create_order échoue → pas de réaction ✅, message de secours', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({
      state: 'CONFIRMATION',
      cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }], mode: 'sur_place' },
    })
    repo.createOrder = vi.fn().mockRejectedValue(new Error('rpc down'))
    await expect(process()('chan-uuid', webhookPayload('1'))).resolves.toBeUndefined()
    expect(react).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('souci technique'))
  })

  it('menu avec suppléments → contexte machine transmis dans la bonne forme, entre en SUPPLEMENTS', async () => {
    repo.getBotContext = vi.fn().mockResolvedValue({
      restaurantName: 'Chez Test', driveEnabled: true,
      driveSlots: [{ id: 's1', label: '12h00' }],
      menu: {
        categories: [{
          name: 'Plats',
          items: [{
            id: 'i1', name: 'Bo Bun', price: 4500,
            supplements: [{ id: 'sup-1', name: 'Œuf', price: 300 }],
          }],
        }],
      },
    })
    repo.loadConversation = vi.fn().mockResolvedValue({ state: 'MENU', cart: EMPTY_CART })
    await process()('chan-uuid', webhookPayload('1'))
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('Œuf'))
    expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'SUPPLEMENTS', expect.objectContaining({
      items: [expect.objectContaining({ menuItemId: 'i1', supplements: [] })],
    }))
  })

  it('confirmation avec suppléments → panier transmis à createOrder avec ses lignes suppléments', async () => {
    repo.loadConversation = vi.fn().mockResolvedValue({
      state: 'CONFIRMATION',
      cart: {
        items: [{
          menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1,
          supplements: [{ id: 'sup-1', name: 'Œuf', price: 300 }],
        }],
        mode: 'sur_place',
      },
    })
    await process()('chan-uuid', webhookPayload('1'))
    expect(repo.createOrder).toHaveBeenCalledWith('resto-1', 'cust-1', expect.objectContaining({
      items: [expect.objectContaining({ supplements: [{ id: 'sup-1', name: 'Œuf', price: 300 }] })],
    }))
  })

  it('erreur de traitement d’un message → message de secours envoyé, pas de crash', async () => {
    repo.upsertCustomer = vi.fn().mockRejectedValue(new Error('db down'))
    await expect(process()('chan-uuid', webhookPayload('menu'))).resolves.toBeUndefined()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('souci technique'))
  })

  it('échec d’envoi Whapi → loggé en message_logs, pas de crash', async () => {
    sendText = vi.fn().mockRejectedValue(new Error('whapi 500'))
    await expect(process()('chan-uuid', webhookPayload('menu'))).resolves.toBeUndefined()
    expect(repo.logMessage).toHaveBeenCalledWith(
      expect.anything(), 'out', expect.any(String), expect.any(String), undefined, expect.any(String),
    )
  })

  describe('bot vivant — présence (typing + accusé de lecture)', () => {
    it('message texte traité → sendTyping + markAsRead appelés avec chat_id/message id', async () => {
      await process()('chan-uuid', webhookPayload('menu'))
      expect(sendTyping).toHaveBeenCalledWith(CHAT_ID)
      expect(markAsRead).toHaveBeenCalledWith('MSG-menu')
    })

    it('état HUMAIN → ni sendTyping ni markAsRead (opérateur humain a la main)', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({ state: 'HUMAIN', cart: EMPTY_CART })
      await process()('chan-uuid', webhookPayload('menu'))
      expect(sendTyping).not.toHaveBeenCalled()
      expect(markAsRead).not.toHaveBeenCalled()
    })

    it('sendTyping rejeté → n’empêche pas la réponse texte', async () => {
      sendTyping = vi.fn().mockRejectedValue(new Error('whapi 500'))
      await expect(process()('chan-uuid', webhookPayload('menu'))).resolves.toBeUndefined()
      expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('Bo Bun'))
    })
  })

  describe('bot vivant — carte GPS sur "infos"', () => {
    it('infos avec coordonnées GPS → sendLocation appelé après le texte + loggé', async () => {
      const order: string[] = []
      sendText = vi.fn().mockImplementation(async () => { order.push('text'); return { id: 'OUT-1' } })
      sendLocation = vi.fn().mockImplementation(async () => { order.push('location'); return { id: 'OUT-LOC' } })
      repo.getBotContext = vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
        menu: { categories: [] },
        profile: { address: '12 rue Test' },
        gps: { lat: 0.3901, lng: 9.4544 },
      })
      await process()('chan-uuid', webhookPayload('infos'))
      expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('12 rue Test'))
      expect(sendLocation).toHaveBeenCalledWith(CHAT_ID, 0.3901, 9.4544, 'Chez Test')
      expect(repo.logMessage).toHaveBeenCalledWith('resto-1', 'out', CHAT_ID, '📍 Position partagée', 'OUT-LOC')
      expect(order).toEqual(['text', 'location'])
    })

    it('infos sans coordonnées GPS → pas de sendLocation', async () => {
      repo.getBotContext = vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
        menu: { categories: [] },
      })
      await process()('chan-uuid', webhookPayload('infos'))
      expect(sendText).toHaveBeenCalled()
      expect(sendLocation).not.toHaveBeenCalled()
    })

    it('état HUMAIN → "infos" avalé silencieusement, pas de sendLocation', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({ state: 'HUMAIN', cart: EMPTY_CART })
      repo.getBotContext = vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [],
        menu: { categories: [] },
        gps: { lat: 0.3901, lng: 9.4544 },
      })
      await process()('chan-uuid', webhookPayload('infos'))
      expect(sendText).not.toHaveBeenCalled()
      expect(sendLocation).not.toHaveBeenCalled()
    })
  })

  describe('bot vivant — GPS entrant (message location)', () => {
    it('location en état ADRESSE → traité comme le texte d’adresse, panier avec lien maps', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({
        state: 'ADRESSE',
        cart: { items: [{ menuItemId: 'i1', name: 'Bo Bun', unitPrice: 4500, qty: 1 }], mode: 'livraison' },
      })
      await process()('chan-uuid', locationPayload(0.3901, 9.4544))
      expect(repo.logMessage).toHaveBeenCalledWith(
        'resto-1', 'in', CHAT_ID, 'https://maps.google.com/?q=0.3901,9.4544', 'MSG-LOC',
      )
      expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'CONFIRMATION',
        expect.objectContaining({ address: 'https://maps.google.com/?q=0.3901,9.4544' }))
      expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('https://maps.google.com/?q=0.3901,9.4544'))
    })

    it('location en état MENU → réponse "pas compris"', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({ state: 'MENU', cart: EMPTY_CART })
      await process()('chan-uuid', locationPayload(0.3901, 9.4544))
      expect(sendText).toHaveBeenCalledWith(CHAT_ID, expect.stringContaining('pas compris'))
      expect(repo.saveConversation).toHaveBeenCalledWith('resto-1', 'cust-1', 'MENU', expect.anything())
    })

    it('message location sans champ location → ignoré comme les autres non-text', async () => {
      await process()('chan-uuid', locationPayload(0, 0, { location: undefined }))
      expect(sendText).not.toHaveBeenCalled()
      expect(repo.logMessage).not.toHaveBeenCalled()
    })
  })
})
