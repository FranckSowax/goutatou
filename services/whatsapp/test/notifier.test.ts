import { describe, expect, it, vi } from 'vitest'
import { statusMessage, handleOrderUpdate, type OrderRow } from '../src/notifier.js'

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

  function fakeDbWithWheel(chatId: string, restaurant: { wheel_enabled: boolean; wheel_trigger_orders: number } | null, recupCount: number, prizeCount: number) {
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

  it('recuperee + roue activée + seuil atteint + lot dispo : envoie aussi le lien roue', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbWithWheel('24177@s.whatsapp.net', { wheel_enabled: true, wheel_trigger_orders: 3 }, 3, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText }), decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText).toHaveBeenNthCalledWith(2, '24177@s.whatsapp.net', expect.stringContaining('/roue?t='))
  })

  it('recuperee + roue désactivée : pas d’envoi du lien roue', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const decrypt = vi.fn().mockReturnValue('tok')
    const db = fakeDbWithWheel('24177@s.whatsapp.net', { wheel_enabled: false, wheel_trigger_orders: 3 }, 3, 1)
    await handleOrderUpdate(db as never, 'k'.repeat(64), oldRow,
      { ...oldRow, status: 'recuperee' }, () => ({ sendText }), decrypt, 's'.repeat(32), 'https://x.test')
    expect(sendText).toHaveBeenCalledTimes(1)
  })
})
