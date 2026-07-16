import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_CART } from '@goutatou/db'
import { createProcessor, type ProcessorDeps } from '../src/processor.js'
import type { BotRepo } from '../src/repo.js'
import type { ArrivalRepo } from '../src/drive/arrival-repo.js'

const CHAT_ID = '24177000001@s.whatsapp.net'

function replyPayload(id: string, title = '✅ Je suis arrivé') {
  return {
    messages: [{
      id: 'MSG-ARRIVAL',
      from_me: false,
      type: 'reply',
      chat_id: CHAT_ID,
      from: '24177000001',
      from_name: 'Client Test',
      reply: { type: 'buttons_reply', buttons_reply: { id, title } },
    }],
    channel_id: 'WHAPI-CHAN',
  }
}

function textPayload(body: string, msgId = 'MSG-ARRIVAL-TXT') {
  return {
    messages: [{
      id: msgId,
      from_me: false,
      type: 'text',
      chat_id: CHAT_ID,
      from: '24177000001',
      from_name: 'Client Test',
      text: { body },
    }],
    channel_id: 'WHAPI-CHAN',
  }
}

describe('processor — arrivée Drive (bouton arr:)', () => {
  let repo: BotRepo
  let arrivalRepo: ArrivalRepo
  let sendText: ReturnType<typeof vi.fn>
  let sendQuickReplies: ReturnType<typeof vi.fn>
  let deps: ProcessorDeps

  function process() {
    return createProcessor(repo, () => ({
      sendText,
      sendImage: vi.fn(),
      sendTyping: vi.fn().mockResolvedValue(undefined),
      markAsRead: vi.fn().mockResolvedValue(undefined),
      react: vi.fn().mockResolvedValue(undefined),
      sendLocation: vi.fn().mockResolvedValue({ id: 'OUT-LOC' }),
      sendCatalog: vi.fn().mockResolvedValue({ id: 'OUT-CATALOG' }),
      getOrderItems: vi.fn(),
      sendQuickReplies,
    }), deps)
  }

  beforeEach(() => {
    sendText = vi.fn().mockResolvedValue({ id: 'OUT-TEXT' })
    sendQuickReplies = vi.fn().mockResolvedValue({ id: 'OUT-QR' })

    repo = {
      getChannel: vi.fn().mockResolvedValue({
        channelUuid: 'chan-uuid', restaurantId: 'resto-1', restaurantName: 'Chez Test',
        token: 'tok', driveEnabled: true,
      }),
      getBotContext: vi.fn().mockResolvedValue({
        restaurantName: 'Chez Test', driveEnabled: true, driveSlots: [], menu: { categories: [] },
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

    arrivalRepo = {
      getOrder: vi.fn(),
      markArrived: vi.fn(),
    }

    deps = {
      sleep: vi.fn().mockResolvedValue(undefined),
      sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 8,
      arrivalRepo,
    }
  })

  it('tap valide (drive, prete) → markArrived appelé + confirmation FR', async () => {
    arrivalRepo.getOrder = vi.fn().mockResolvedValue({ id: 'o1', restaurantId: 'resto-1', mode: 'drive', status: 'prete', customerChatId: CHAT_ID })
    arrivalRepo.markArrived = vi.fn().mockResolvedValue(true)

    await process()('chan-uuid', replyPayload('arr:o1'))

    expect(arrivalRepo.getOrder).toHaveBeenCalledWith('o1', 'resto-1')
    expect(arrivalRepo.markArrived).toHaveBeenCalledWith('o1')
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "C'est noté, on vous apporte votre commande !")
  })

  it('idempotence markArrived : 2e tap (déjà arrivé) → 0 ligne → réponse neutre, pas de 2e "c\'est noté"', async () => {
    arrivalRepo.getOrder = vi.fn().mockResolvedValue({ id: 'o1', restaurantId: 'resto-1', mode: 'drive', status: 'prete', customerChatId: CHAT_ID })
    arrivalRepo.markArrived = vi.fn().mockResolvedValue(false) // condition arrived_at is null ne matche plus

    await process()('chan-uuid', replyPayload('arr:o1'))

    expect(arrivalRepo.markArrived).toHaveBeenCalledWith('o1')
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Cette commande n'est plus en attente.")
    expect(sendText).not.toHaveBeenCalledWith(CHAT_ID, "C'est noté, on vous apporte votre commande !")
  })

  it('garde — commande introuvable (id inconnu ou autre resto) → message FR neutre, aucune écriture', async () => {
    arrivalRepo.getOrder = vi.fn().mockResolvedValue(null)

    await process()('chan-uuid', replyPayload('arr:o1'))

    expect(arrivalRepo.getOrder).toHaveBeenCalledWith('o1', 'resto-1')
    expect(arrivalRepo.markArrived).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Cette commande n'est plus en attente.")
  })

  it('garde — mode ≠ drive → message FR neutre, aucune écriture', async () => {
    arrivalRepo.getOrder = vi.fn().mockResolvedValue({ id: 'o1', restaurantId: 'resto-1', mode: 'livraison', status: 'prete' })

    await process()('chan-uuid', replyPayload('arr:o1'))

    expect(arrivalRepo.markArrived).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Cette commande n'est plus en attente.")
  })

  it('garde — statut déjà recuperee → message FR neutre, aucune écriture', async () => {
    arrivalRepo.getOrder = vi.fn().mockResolvedValue({ id: 'o1', restaurantId: 'resto-1', mode: 'drive', status: 'recuperee' })

    await process()('chan-uuid', replyPayload('arr:o1'))

    expect(arrivalRepo.markArrived).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Cette commande n'est plus en attente.")
  })

  it('garde — statut annulee → message FR neutre, aucune écriture', async () => {
    arrivalRepo.getOrder = vi.fn().mockResolvedValue({ id: 'o1', restaurantId: 'resto-1', mode: 'drive', status: 'annulee', customerChatId: CHAT_ID })

    await process()('chan-uuid', replyPayload('arr:o1'))

    expect(arrivalRepo.markArrived).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Cette commande n'est plus en attente.")
  })

  it('garde anti-usurpation — tap avec l\'id d\'une commande drive/prete d\'un AUTRE client du même resto → aucune écriture, réponse neutre', async () => {
    // La commande existe, est drive/prete (toutes les autres gardes passeraient), mais appartient
    // à un client dont le chat_id diffère de l'émetteur du tap (CHAT_ID) — cf. IMPORTANT 2.
    arrivalRepo.getOrder = vi.fn().mockResolvedValue({
      id: 'o1', restaurantId: 'resto-1', mode: 'drive', status: 'prete',
      customerChatId: '24177999999@s.whatsapp.net',
    })

    await process()('chan-uuid', replyPayload('arr:o1'))

    expect(arrivalRepo.getOrder).toHaveBeenCalledWith('o1', 'resto-1')
    expect(arrivalRepo.markArrived).not.toHaveBeenCalled()
    expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Cette commande n'est plus en attente.")
  })

  describe('repli par contexte — texte (id de bouton non revenu)', () => {
    it('texte d\'arrivée + 1 commande drive en attente → markArrived appelé + confirmation FR', async () => {
      arrivalRepo.findPendingDriveOrder = vi.fn().mockResolvedValue({ id: 'o1' })
      arrivalRepo.getOrder = vi.fn().mockResolvedValue({ id: 'o1', restaurantId: 'resto-1', mode: 'drive', status: 'prete', customerChatId: CHAT_ID })
      arrivalRepo.markArrived = vi.fn().mockResolvedValue(true)

      await process()('chan-uuid', textPayload('je suis arrive'))

      expect(arrivalRepo.findPendingDriveOrder).toHaveBeenCalledWith('resto-1', 'cust-1')
      expect(arrivalRepo.getOrder).toHaveBeenCalledWith('o1', 'resto-1')
      expect(arrivalRepo.markArrived).toHaveBeenCalledWith('o1')
      expect(sendText).toHaveBeenCalledWith(CHAT_ID, "C'est noté, on vous apporte votre commande !")
    })

    it('texte d\'arrivée + AUCUNE commande drive en attente → aucune écriture, flux machine normal (pas de "plus en attente")', async () => {
      arrivalRepo.findPendingDriveOrder = vi.fn().mockResolvedValue(null)

      await process()('chan-uuid', textPayload('✅ Je suis arrivé'))

      expect(arrivalRepo.findPendingDriveOrder).toHaveBeenCalledWith('resto-1', 'cust-1')
      expect(arrivalRepo.getOrder).not.toHaveBeenCalled()
      expect(arrivalRepo.markArrived).not.toHaveBeenCalled()
      expect(sendText).not.toHaveBeenCalledWith(CHAT_ID, "Cette commande n'est plus en attente.")
      expect(repo.loadConversation).toHaveBeenCalled()
    })

    it('texte d\'arrivée + commande déjà arrivée (idempotent, 0 ligne) → réponse neutre, pas de double alerte', async () => {
      arrivalRepo.findPendingDriveOrder = vi.fn().mockResolvedValue({ id: 'o1' })
      arrivalRepo.getOrder = vi.fn().mockResolvedValue({ id: 'o1', restaurantId: 'resto-1', mode: 'drive', status: 'prete', customerChatId: CHAT_ID })
      arrivalRepo.markArrived = vi.fn().mockResolvedValue(false)

      await process()('chan-uuid', textPayload('JE SUIS ARRIVÉ !'))

      expect(arrivalRepo.markArrived).toHaveBeenCalledWith('o1')
      expect(sendText).toHaveBeenCalledWith(CHAT_ID, "Cette commande n'est plus en attente.")
      expect(sendText).not.toHaveBeenCalledWith(CHAT_ID, "C'est noté, on vous apporte votre commande !")
    })

    it('texte quelconque (non-arrivée) → jamais routé vers arrivalRepo, même avec une commande drive en attente', async () => {
      arrivalRepo.findPendingDriveOrder = vi.fn().mockResolvedValue({ id: 'o1' })

      await process()('chan-uuid', textPayload('menu'))

      expect(arrivalRepo.findPendingDriveOrder).not.toHaveBeenCalled()
      expect(arrivalRepo.getOrder).not.toHaveBeenCalled()
      expect(arrivalRepo.markArrived).not.toHaveBeenCalled()
    })

    it('arrivalRepo non fourni → texte d\'arrivée ignoré par le repli, suit le flux machine, jamais de throw', async () => {
      deps = { sleep: vi.fn().mockResolvedValue(undefined), sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 8 }

      await expect(process()('chan-uuid', textPayload('je suis arrive'))).resolves.not.toThrow()

      expect(repo.loadConversation).toHaveBeenCalled()
    })
  })

  describe('non-régression', () => {
    it('arrivalRepo non fourni (deps.arrivalRepo undefined) → best-effort, jamais de throw', async () => {
      deps = { sleep: vi.fn().mockResolvedValue(undefined), sendDelayMinMs: 0, sendDelayMaxMs: 0, menuPhotosMax: 8 }
      await expect(process()('chan-uuid', replyPayload('arr:o1'))).resolves.not.toThrow()
      expect(sendText).not.toHaveBeenCalled()
    })

    it('idempotence webhook : message déjà loggé (logMessage renvoie false) → aucun traitement', async () => {
      repo.logMessage = vi.fn().mockResolvedValue(false)
      await process()('chan-uuid', replyPayload('arr:o1'))

      expect(arrivalRepo.getOrder).not.toHaveBeenCalled()
    })

    it('id non-arrivée (in:/titre) → toujours routé vers la machine, jamais vers arrivalRepo', async () => {
      repo.loadConversation = vi.fn().mockResolvedValue({ state: 'ACCUEIL', cart: EMPTY_CART })
      await process()('chan-uuid', replyPayload('in:menu', 'menu'))

      expect(arrivalRepo.getOrder).not.toHaveBeenCalled()
      expect(repo.loadConversation).toHaveBeenCalled()
    })
  })
})
