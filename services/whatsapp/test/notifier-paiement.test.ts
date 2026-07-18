import { describe, expect, it, vi } from 'vitest'
import { buildStaffTicket, handleOrderInsert, handleOrderUpdate, type OrderRow } from '../src/notifier.js'

const baseRow: OrderRow = {
  id: 'o1', restaurant_id: 'r1', customer_id: 'c1', order_number: 7, status: 'recue', mode: 'sur_place',
  total: 4500, delivery_address: null,
}

describe('buildStaffTicket — ligne Paiement', () => {
  it('airtel à vérifier → « 📱 Airtel Money (à vérifier) »', () => {
    const ticket = buildStaffTicket(
      { ...baseRow, payment_method: 'airtel', payment_status: 'a_verifier' },
      [{ name: 'Bo Bun', unit_price: 4500, qty: 1 }], { name: 'Awa', phone: '241770' })
    expect(ticket).toContain('Paiement : 📱 Airtel Money (à vérifier)')
  })

  it('airtel payé → « 📱 Airtel Money ✓ »', () => {
    const ticket = buildStaffTicket(
      { ...baseRow, payment_method: 'airtel', payment_status: 'paye' },
      [], { name: 'Awa', phone: '241770' })
    expect(ticket).toContain('Paiement : 📱 Airtel Money ✓')
  })

  it('cash → « 💵 À la remise »', () => {
    const ticket = buildStaffTicket(
      { ...baseRow, payment_method: 'cash', payment_status: 'na' },
      [], { name: 'Awa', phone: '241770' })
    expect(ticket).toContain('Paiement : 💵 À la remise')
  })

  it('payment_method null + statut na (flux actuel sans étape paiement) → « 💵 À la remise »', () => {
    const ticket = buildStaffTicket(
      { ...baseRow, payment_method: null, payment_status: 'na' },
      [], { name: 'Awa', phone: '241770' })
    expect(ticket).toContain('Paiement : 💵 À la remise')
  })

  it('colonnes payment absentes (lignes historiques/tests) → pas de ligne Paiement, ticket inchangé', () => {
    const ticket = buildStaffTicket(baseRow, [], { name: 'Awa', phone: '241770' })
    expect(ticket).not.toContain('Paiement :')
  })
})

function fakeInsertDb() {
  const sendText = vi.fn().mockResolvedValue({ id: 'x' })
  const db = {
    from: vi.fn((table: string) => {
      if (table === 'restaurants') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { staff_group_id: 'grp1@g.us' } }) }) }) }
      }
      if (table === 'whapi_channels') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { token_encrypted: 'enc', status: 'active' } }) }) }) }
      }
      if (table === 'order_items') {
        return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [] }) }) }) }
      }
      if (table === 'customers') {
        return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { name: 'Awa', phone: '241770', chat_id: '24177@s.whatsapp.net' } }) }) }) }
      }
      throw new Error(`table inattendue : ${table}`)
    }),
  }
  return { db, sendText }
}

describe('handleOrderInsert — paiement Airtel à vérifier', () => {
  it('payment_status a_verifier → AUCUN ticket cuisine (il partira à la validation)', async () => {
    const { db, sendText } = fakeInsertDb()
    await handleOrderInsert(
      db as never, 'k'.repeat(64),
      { ...baseRow, payment_method: 'airtel', payment_status: 'a_verifier' },
      () => ({ sendText }))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('payment_status na (cash/flux actuel) → ticket envoyé comme avant', async () => {
    const { db, sendText } = fakeInsertDb()
    await handleOrderInsert(
      db as never, 'k'.repeat(64),
      { ...baseRow, payment_method: null, payment_status: 'na' },
      () => ({ sendText }), vi.fn().mockReturnValue('tok'))
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith('grp1@g.us', expect.stringContaining('Commande #7'))
  })
})

describe('handleOrderUpdate — payment_status passe à paye', () => {
  function fakeUpdateDb(opts: { staffGroupId?: string | null } = {}) {
    const { staffGroupId = 'grp1@g.us' } = opts
    return {
      from: vi.fn((table: string) => {
        if (table === 'customers') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { chat_id: '24177@s.whatsapp.net', name: 'Awa', phone: '241770' } }) }) }) }
        }
        if (table === 'whapi_channels') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { token_encrypted: 'enc', status: 'active' } }) }) }) }
        }
        if (table === 'restaurants') {
          return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { staff_group_id: staffGroupId } }) }) }) }
        }
        if (table === 'order_items') {
          return { select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [{ name: 'Bo Bun', unit_price: 4500, qty: 1 }] }) }) }) }
        }
        throw new Error(`table inattendue : ${table}`)
      }),
    }
  }

  const paidOld: OrderRow = { ...baseRow, payment_method: 'airtel', payment_status: 'a_verifier' }
  const paidNew: OrderRow = { ...baseRow, payment_method: 'airtel', payment_status: 'paye' }

  it('a_verifier → paye : ticket cuisine (avec ✓) au groupe + message client « Paiement confirmé »', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    const decrypt = vi.fn().mockReturnValue('tok')
    await handleOrderUpdate(fakeUpdateDb() as never, 'k'.repeat(64), paidOld, paidNew, () => ({ sendText }) as never, decrypt)
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText).toHaveBeenCalledWith('grp1@g.us', expect.stringContaining('Paiement : 📱 Airtel Money ✓'))
    expect(sendText).toHaveBeenCalledWith('24177@s.whatsapp.net', expect.stringContaining('Paiement confirmé'))
    expect(sendText).toHaveBeenCalledWith('24177@s.whatsapp.net', expect.stringContaining('n°7'))
  })

  it('idempotence : paye → paye (doublon Realtime) → aucun envoi', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    await handleOrderUpdate(fakeUpdateDb() as never, 'k'.repeat(64), paidNew, { ...paidNew }, () => ({ sendText }) as never, vi.fn().mockReturnValue('tok'))
    expect(sendText).not.toHaveBeenCalled()
  })

  it('sans staff_group_id → pas de ticket, mais le message client part quand même', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    await handleOrderUpdate(fakeUpdateDb({ staffGroupId: null }) as never, 'k'.repeat(64), paidOld, paidNew, () => ({ sendText }) as never, vi.fn().mockReturnValue('tok'))
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith('24177@s.whatsapp.net', expect.stringContaining('Paiement confirmé'))
  })

  it('changement de statut SANS changement de payment_status → flux statut normal inchangé', async () => {
    const sendText = vi.fn().mockResolvedValue({ id: 'x' })
    await handleOrderUpdate(fakeUpdateDb() as never, 'k'.repeat(64),
      { ...baseRow, payment_status: 'na' }, { ...baseRow, payment_status: 'na', status: 'en_preparation' },
      () => ({ sendText }) as never, vi.fn().mockReturnValue('tok'))
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith('24177@s.whatsapp.net', expect.stringContaining('préparation'))
  })
})
