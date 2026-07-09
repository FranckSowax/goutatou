import { describe, expect, it } from 'vitest'
import { validateWebOrder } from '../src/lib/lp/order-validation'

const valid = {
  customerName: 'Franck',
  phone: '077123456',
  mode: 'drive',
  driveSlotId: 'slot-1',
  items: [{ menuItemId: 'a', qty: 2 }],
}

describe('validateWebOrder', () => {
  it('accepte un payload drive valide et normalise le téléphone', () => {
    const r = validateWebOrder(valid)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload.phone).toBe('24177123456')
  })
  it('exige le créneau en drive et l’adresse en livraison', () => {
    expect(validateWebOrder({ ...valid, driveSlotId: undefined }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, mode: 'livraison', address: 'ici' }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, mode: 'livraison', address: 'Quartier Glass, LBV' }).ok).toBe(true)
  })
  it('rejette téléphone invalide, panier vide, qty hors bornes', () => {
    expect(validateWebOrder({ ...valid, phone: '12' }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, items: [] }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, items: [{ menuItemId: 'a', qty: 0 }] }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, items: [{ menuItemId: 'a', qty: 21 }] }).ok).toBe(false)
    expect(validateWebOrder({ ...valid, items: [{ menuItemId: 'a', qty: 1.5 }] }).ok).toBe(false)
  })
  it('rejette non-objet et nom trop court', () => {
    expect(validateWebOrder(null).ok).toBe(false)
    expect(validateWebOrder({ ...valid, customerName: 'F' }).ok).toBe(false)
  })
})
