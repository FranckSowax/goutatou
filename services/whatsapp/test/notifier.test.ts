import { describe, expect, it, vi } from 'vitest'
import { statusMessage, handleOrderUpdate, handleOrderInsert, buildStaffTicket, type OrderRow } from '../src/notifier.js'

describe('statusMessage', () => {
  it('couvre chaque statut notifiable selon le mode', () => {
    expect(statusMessage('en_preparation', 7, 'drive')).toContain('n°7')
    expect(statusMessage('en_preparation', 7, 'drive')).toContain('préparation')
    expect(statusMessage('prete', 7, 'drive')).toContain('prête')
    expect(statusMessage('prete', 7, 'livraison')).toContain('livreur')
    expect(statusMessage('recuperee', 7, 'drive')).toContain('Merci')
    expect(statusMessage('annulee', 7, 'drive')).toContain('annulée')
    expect(statusMessage('recue', 7, 'drive')).toBeNull()
  })
})

describe('handleOrderUpdate', () => {
  const oldRow: OrderRow = { id: 'o1', restaurant_id: 'r1', customer_id: 'c1', order_number: 7, status: 'recue', mode: 'drive' }

  function fakeDb(chatId = '24177@s.whatsapp.net') {
    const single = vi.fn()
      .mockResolvedValueOnce({ data: { chat_id: chatId } })                       // customers
      .mockResolvedValueOnce({ data: { token_encrypted: 'enc', status: 'active' } }) // whapi_channels
    return { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ single })) })) })) }
  }

  it('statut inchangé → aucun envoi', async () => {
    const sendText = vi.fn()
    await handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), oldRow, { ...oldRow }, () => ({ sendText }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('recue → prete : envoie le message au chat_id du client', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const decrypt = vi.fn().mockReturnValue('tok')
    await handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'prete' }, () => ({ sendText }), decrypt)
    expect(sendText).toHaveBeenCalledWith('24177@s.whatsapp.net', expect.stringContaining('n°7'))
  })

  function fakeDbWithWheel(chatId: string, restaurant: { wheel_enabled: boolean; wheel_trigger_orders: number; wheel_qr_public?: boolean } | null, recupCount: number, prizeCount: number) {
    return {
      from: vi.fn((table: string) => {
        if (table === 'customers') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { chat_id: chatId } }) }) }) }
        }
        if (table === 'whapi_channels') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { token_encrypted: 'enc', status: 'active' } }) }) }) }
        }
        if (table === 'restaurants') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: restaurant }) }) }) }
        }
        if (table === 'orders') {
          const builder: PromiseLike<{ count: number }> & { eq: () => typeof builder } = {
            eq: () => builder,
            then: (resolve) => Promise.resolve({ count: recupCount }).then(resolve),
          }
          return { select: () => builder }
        }
        if (table === 'prizes') {
          const builder: PromiseLike<{ count: number }> & { eq: () => typeof builder; neq: () => typeof builder } = {
            eq: () => builder,
            neq: () => builder,
            then: (resolve) => Promise.resolve({ count: prizeCount }).then(resolve),
          }
          return { select: () => builder }
        }
        throw new Error(`table inattendue : ${table}`)
      }),
    }
  }

  it('recuperee + roue activée + seuil atteint + lot dispo : bouton interactif OK → pas de fallback sendText', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const sendInteractiveUrl = vi.fn().mockResolvedValue({ id: 'i1' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbWithWheel('24177@s.whatsapp.net', { wheel_enabled: true, wheel_trigger_orders: 3, wheel_qr_public: false }, 3, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText, sendInteractiveUrl }), decrypt, 's'.repeat(32), 'https://x.test')
    // 1 seul sendText (le message de statut) : le lien roue passe par le bouton interactif, pas de fallback.
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendInteractiveUrl).toHaveBeenCalledTimes(1)
    const [chatId, body, buttonText, url] = sendInteractiveUrl.mock.calls[0]
    expect(chatId).toBe('24177@s.whatsapp.net')
    expect(body).not.toContain('/roue?t=')
    expect(buttonText).toBe('🎰 Tourner la roue')
    expect(url).toContain('/roue?t=')
  })

  it('recuperee + roue activée : bouton interactif échoue → fallback sendText byte-identique au message v1', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const sendInteractiveUrl = vi.fn().mockRejectedValue(new Error('whapi interactive 400'))
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbWithWheel('24177@s.whatsapp.net', { wheel_enabled: true, wheel_trigger_orders: 3, wheel_qr_public: false }, 3, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText, sendInteractiveUrl }), decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendInteractiveUrl).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText).toHaveBeenNthCalledWith(2, '24177@s.whatsapp.net', expect.stringContaining('/roue?t='))
  })

  it('recuperee + roue activée : makeWhapi sans sendInteractiveUrl (v1) → fallback sendText inchangé', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbWithWheel('24177@s.whatsapp.net', { wheel_enabled: true, wheel_trigger_orders: 3, wheel_qr_public: false }, 3, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText }) as never, decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText).toHaveBeenNthCalledWith(2, '24177@s.whatsapp.net', expect.stringContaining('/roue?t='))
  })

  it('recuperee + roue désactivée : pas d’envoi du lien roue', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbWithWheel('24177@s.whatsapp.net', { wheel_enabled: false, wheel_trigger_orders: 3, wheel_qr_public: false }, 3, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText }), decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendText).toHaveBeenCalledTimes(1)
  })

  it('recuperee + roue activée MAIS roue QR publique active : aucune offre de roue (remplacée par la roue QR)', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const sendInteractiveUrl = vi.fn().mockResolvedValue({ id: 'i1' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbWithWheel('24177@s.whatsapp.net', { wheel_enabled: true, wheel_trigger_orders: 3, wheel_qr_public: true }, 3, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText, sendInteractiveUrl }), decrypt, 's'.repeat(32), 'https://x.test')
    // Seul le message de statut part ; ni bouton interactif ni fallback texte pour le jeton v2.
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendInteractiveUrl).not.toHaveBeenCalled()
  })

  function fakeDbLoyalty(chatId: string, loyaltyEnabled: boolean, recupCount: number) {
    return {
      from: vi.fn((table: string) => {
        if (table === 'customers') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { chat_id: chatId } }) }) }) }
        }
        if (table === 'whapi_channels') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { token_encrypted: 'enc', status: 'active' } }) }) }) }
        }
        if (table === 'restaurants') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { loyalty_enabled: loyaltyEnabled, wheel_enabled: false, wheel_trigger_orders: 3, wheel_qr_public: false } }) }) }) }
        }
        if (table === 'orders') {
          const builder: PromiseLike<{ count: number }> & { eq: () => typeof builder } = {
            eq: () => builder,
            then: (resolve) => Promise.resolve({ count: recupCount }).then(resolve),
          }
          return { select: () => builder }
        }
        throw new Error(`table inattendue : ${table}`)
      }),
    }
  }

  it('recuperee + fidélité activée + 1ʳᵉ commande récupérée : envoie le lien carte via bouton interactif', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const sendInteractiveUrl = vi.fn().mockResolvedValue({ id: 'i1' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbLoyalty('24177@s.whatsapp.net', true, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText, sendInteractiveUrl }), decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendText).toHaveBeenCalledTimes(1) // message de statut uniquement
    expect(sendInteractiveUrl).toHaveBeenCalledTimes(1)
    const [chatId, body, buttonText, url] = sendInteractiveUrl.mock.calls[0]
    expect(chatId).toBe('24177@s.whatsapp.net')
    expect(buttonText).toBe('💳 Ma carte de fidélité')
    expect(body).not.toContain('/f/')
    expect(url).toContain('https://x.test/f/')
  })

  it('recuperee + fidélité activée : bouton interactif échoue → fallback sendText avec le lien carte', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const sendInteractiveUrl = vi.fn().mockRejectedValue(new Error('whapi 400'))
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbLoyalty('24177@s.whatsapp.net', true, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText, sendInteractiveUrl }), decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendInteractiveUrl).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText).toHaveBeenNthCalledWith(2, '24177@s.whatsapp.net', expect.stringContaining('https://x.test/f/'))
  })

  it('recuperee + fidélité activée mais PAS la 1ʳᵉ commande (count 2) : pas de lien carte', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const sendInteractiveUrl = vi.fn().mockResolvedValue({ id: 'i1' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbLoyalty('24177@s.whatsapp.net', true, 2)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText, sendInteractiveUrl }), decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendInteractiveUrl).not.toHaveBeenCalled()
  })

  it('recuperee + fidélité activée ET roue activée : la carte remplace la roue (aucune offre de roue)', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const sendInteractiveUrl = vi.fn().mockResolvedValue({ id: 'i1' })
    const decrypt = vi.fn().mockReturnValue('tok')
    // restaurants renvoie loyalty_enabled ET wheel_enabled true : la garde loyalty prime + return.
    const db = {
      from: vi.fn((table: string) => {
        if (table === 'customers') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { chat_id: '24177@s.whatsapp.net' } }) }) }) }
        if (table === 'whapi_channels') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { token_encrypted: 'enc', status: 'active' } }) }) }) }
        if (table === 'restaurants') return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { loyalty_enabled: true, wheel_enabled: true, wheel_trigger_orders: 1, wheel_qr_public: false } }) }) }) }
        if (table === 'orders') {
          const builder: PromiseLike<{ count: number }> & { eq: () => typeof builder } = { eq: () => builder, then: (r) => Promise.resolve({ count: 1 }).then(r) }
          return { select: () => builder }
        }
        if (table === 'prizes') throw new Error('prizes ne doit pas être interrogé quand loyalty_enabled')
        throw new Error(`table inattendue : ${table}`)
      }),
    }
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText, sendInteractiveUrl }), decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendInteractiveUrl).toHaveBeenCalledTimes(1)
    expect(sendInteractiveUrl.mock.calls[0][3]).toContain('/f/') // carte, pas /roue?t=
  })

  describe('bouton "je suis arrivé" (Drive, commande prête)', () => {
    it('prete + mode drive : envoie le bouton EN PLUS du message de statut (jamais à sa place)', async () => {
      const sendText = vi.fn().mockResolvedValue({ id: 'x' })
      const sendQuickReplies = vi.fn().mockResolvedValue({ id: 'qr1' })
      const decrypt = vi.fn().mockReturnValue('tok')
      await handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), oldRow,
        { ...oldRow, status: 'prete' }, () => ({ sendText, sendQuickReplies }), decrypt)

      expect(sendText).toHaveBeenCalledTimes(1)
      expect(sendText).toHaveBeenCalledWith('24177@s.whatsapp.net', expect.stringContaining('n°7'))
      expect(sendQuickReplies).toHaveBeenCalledTimes(1)
      expect(sendQuickReplies).toHaveBeenCalledWith(
        '24177@s.whatsapp.net',
        expect.any(String),
        [{ id: 'arr:o1', title: '✅ Je suis arrivé' }],
      )
    })

    it('prete + mode livraison : pas de bouton arrivée (Drive uniquement)', async () => {
      const sendText = vi.fn().mockResolvedValue({ id: 'x' })
      const sendQuickReplies = vi.fn().mockResolvedValue({ id: 'qr1' })
      const decrypt = vi.fn().mockReturnValue('tok')
      await handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), { ...oldRow, mode: 'livraison' },
        { ...oldRow, mode: 'livraison', status: 'prete' }, () => ({ sendText, sendQuickReplies }), decrypt)

      expect(sendText).toHaveBeenCalledTimes(1)
      expect(sendQuickReplies).not.toHaveBeenCalled()
    })

    it('drive mais statut recuperee (pas prete) : pas de bouton arrivée', async () => {
      const sendText = vi.fn().mockResolvedValue({ id: 'x' })
      const sendQuickReplies = vi.fn().mockResolvedValue({ id: 'qr1' })
      const decrypt = vi.fn().mockReturnValue('tok')
      await handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), oldRow,
        { ...oldRow, status: 'recuperee' }, () => ({ sendText, sendQuickReplies }), decrypt)

      expect(sendQuickReplies).not.toHaveBeenCalled()
    })

    it('makeWhapi sans sendQuickReplies (v1) : le message de statut part quand même, jamais de throw', async () => {
      const sendText = vi.fn().mockResolvedValue({ id: 'x' })
      const decrypt = vi.fn().mockReturnValue('tok')
      await expect(handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), oldRow,
        { ...oldRow, status: 'prete' }, () => ({ sendText }) as never, decrypt)).resolves.not.toThrow()
      expect(sendText).toHaveBeenCalledTimes(1)
    })

    it('sendQuickReplies échoue : best-effort, loggé, jamais bloquant, message de statut déjà parti', async () => {
      const sendText = vi.fn().mockResolvedValue({ id: 'x' })
      const sendQuickReplies = vi.fn().mockRejectedValue(new Error('whapi 500'))
      const decrypt = vi.fn().mockReturnValue('tok')
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await expect(handleOrderUpdate(fakeDb() as never, 'k'.repeat(64), oldRow,
        { ...oldRow, status: 'prete' }, () => ({ sendText, sendQuickReplies }), decrypt)).resolves.not.toThrow()
      expect(sendText).toHaveBeenCalledTimes(1)
      expect(errSpy).toHaveBeenCalled()
      errSpy.mockRestore()
    })
  })
})

describe('buildStaffTicket', () => {
  const newRow: OrderRow = {
    id: 'o1', restaurant_id: 'r1', customer_id: 'c1', order_number: 12, status: 'recue', mode: 'drive',
    total: 7500, delivery_address: null,
  }

  it('formate l’en-tête, les lignes (avec ↳ sans qty×), le total et le client', () => {
    const items = [
      { name: 'Poulet DG', unit_price: 6000, qty: 1 },
      { name: '↳ Frites', unit_price: 1500, qty: 1 },
    ]
    const ticket = buildStaffTicket(newRow, items, { name: 'Awa', phone: '24177000000' })
    expect(ticket).toBe(
      '🧾 *Commande #12* — Retrait\n' +
      '1× Poulet DG\n' +
      '↳ Frites\n' +
      'Total : 7 500 FCFA\n' +
      'Client : Awa',
    )
  })

  it('sans nom client → utilise le téléphone', () => {
    const ticket = buildStaffTicket(newRow, [], { name: null, phone: '24177000000' })
    expect(ticket).toContain('Client : 24177000000')
  })

  it('avec delivery_address → ligne supplémentaire en fin de ticket', () => {
    const ticket = buildStaffTicket(
      { ...newRow, mode: 'livraison', delivery_address: 'Rue des Palmiers, Libreville' },
      [{ name: 'Poulet DG', unit_price: 6000, qty: 2 }],
      { name: 'Awa', phone: '24177000000' },
    )
    expect(ticket.split('\n')).toEqual([
      '🧾 *Commande #12* — Livraison',
      '2× Poulet DG',
      'Total : 7 500 FCFA',
      'Client : Awa',
      'Rue des Palmiers, Libreville',
    ])
  })

  it('sans delivery_address → pas de ligne en trop', () => {
    const ticket = buildStaffTicket(newRow, [], { name: 'Awa', phone: '24177000000' })
    expect(ticket.split('\n')).toHaveLength(3) // en-tête + total + client, pas d'item ni d'adresse
  })
})

describe('handleOrderInsert', () => {
  const newRow: OrderRow = {
    id: 'o1', restaurant_id: 'r1', customer_id: 'c1', order_number: 12, status: 'recue', mode: 'drive',
    total: 7500, delivery_address: null,
  }

  function fakeInsertDb(opts: {
    staffGroupId?: string | null
    channelStatus?: 'active' | 'error' | null
    items?: { name: string; unit_price: number; qty: number }[]
    customer?: { name: string | null; phone: string } | null
  }) {
    const { staffGroupId = 'grp1@g.us', channelStatus = 'active', items = [], customer = { name: 'Awa', phone: '241770' } } = opts
    return {
      from: vi.fn((table: string) => {
        if (table === 'restaurants') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { staff_group_id: staffGroupId } }) }) }) }
        }
        if (table === 'whapi_channels') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: channelStatus === null ? null : { token_encrypted: 'enc', status: channelStatus },
                }),
              }),
            }),
          }
        }
        if (table === 'order_items') {
          return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: items }) }) }) }
        }
        if (table === 'customers') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: customer }) }) }) }
        }
        throw new Error(`table inattendue : ${table}`)
      }),
    }
  }

  it('sans staff_group_id → aucun envoi', async () => {
    const sendText = vi.fn()
    const db = fakeInsertDb({ staffGroupId: null })
    await handleOrderInsert(db as never, 'k'.repeat(64), newRow, () => ({ sendText }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('canal inactif → aucun envoi', async () => {
    const sendText = vi.fn()
    const db = fakeInsertDb({ channelStatus: 'error' })
    await handleOrderInsert(db as never, 'k'.repeat(64), newRow, () => ({ sendText }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('canal absent → aucun envoi', async () => {
    const sendText = vi.fn()
    const db = fakeInsertDb({ channelStatus: null })
    await handleOrderInsert(db as never, 'k'.repeat(64), newRow, () => ({ sendText }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('groupe + canal actif → envoie le ticket au staff_group_id', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeInsertDb({ items: [{ name: 'Poulet DG', unit_price: 6000, qty: 1 }] })
    await handleOrderInsert(db as never, 'k'.repeat(64), newRow, () => ({ sendText }), decrypt)
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith('grp1@g.us', expect.stringContaining('Commande #12'))
    expect(sendText).toHaveBeenCalledWith('grp1@g.us', expect.stringContaining('1× Poulet DG'))
  })

  it('échec sendText → ne lève pas (best-effort)', async () => {
    const sendText = vi.fn().mockRejectedValue(new Error('whapi 500'))
    const db = fakeInsertDb({})
    await expect(handleOrderInsert(db as never, 'k'.repeat(64), newRow, () => ({ sendText }))).resolves.toBeUndefined()
  })

  it('échec requête DB (restaurants) → ne lève pas (best-effort)', async () => {
    const db = { from: vi.fn(() => { throw new Error('db down') }) }
    await expect(handleOrderInsert(db as never, 'k'.repeat(64), newRow)).resolves.toBeUndefined()
  })
})
