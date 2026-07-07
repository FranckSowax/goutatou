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
})
