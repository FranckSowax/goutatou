import { describe, it, expect } from 'vitest'
import { computeCashDay, cashDayTotal, cashDifference, type CashOrder } from '../src/lib/cash'

function order(over: Partial<CashOrder>): CashOrder {
  return {
    total: 1000,
    status: 'recuperee',
    mode: 'sur_place',
    source: 'whatsapp',
    payment_method: null,
    payment_status: 'na',
    ...over,
  }
}

describe('computeCashDay — espèces', () => {
  it('compte une commande remise au client comme encaissée', () => {
    const d = computeCashDay([order({ total: 4500, status: 'recuperee' })])
    expect(d.cashTotal).toBe(4500)
    expect(d.pendingTotal).toBe(0)
    expect(d.ordersCount).toBe(1)
  })
  it('met en attente une commande pas encore récupérée (argent pas rentré)', () => {
    const d = computeCashDay([
      order({ total: 3000, status: 'recue' }),
      order({ total: 2000, status: 'en_preparation' }),
      order({ total: 1000, status: 'prete' }),
    ])
    expect(d.cashTotal).toBe(0)
    expect(d.pendingTotal).toBe(6000)
  })
  it('traite payment_method cash comme le paiement à la remise', () => {
    const d = computeCashDay([order({ total: 2500, payment_method: 'cash', status: 'recuperee' })])
    expect(d.cashTotal).toBe(2500)
  })
})

describe('computeCashDay — Airtel', () => {
  it('compte un paiement Airtel vérifié, quel que soit le statut de la commande', () => {
    const d = computeCashDay([
      order({ total: 7000, payment_method: 'airtel', payment_status: 'paye', status: 'en_preparation' }),
    ])
    expect(d.airtelTotal).toBe(7000)
    expect(d.pendingTotal).toBe(0)
  })
  it('met en attente un Airtel déclaré mais non vérifié', () => {
    const d = computeCashDay([
      order({ total: 6000, payment_method: 'airtel', payment_status: 'a_verifier', status: 'recuperee' }),
    ])
    expect(d.airtelTotal).toBe(0)
    expect(d.cashTotal).toBe(0)
    expect(d.pendingTotal).toBe(6000)
  })
})

describe('computeCashDay — annulées et répartitions', () => {
  it('isole les annulées hors encaissé, attente et répartitions', () => {
    const d = computeCashDay([
      order({ total: 5000, status: 'annulee', mode: 'drive', source: 'web' }),
      order({ total: 1000, status: 'recuperee' }),
    ])
    expect(d.canceledTotal).toBe(5000)
    expect(d.canceledCount).toBe(1)
    expect(d.ordersCount).toBe(1)
    expect(d.cashTotal).toBe(1000)
    expect(d.pendingTotal).toBe(0)
    expect(d.byMode.drive).toBeUndefined()
    expect(d.bySource.web).toBeUndefined()
  })
  it('ventile par mode et par canal', () => {
    const d = computeCashDay([
      order({ total: 1000, mode: 'sur_place', source: 'whatsapp' }),
      order({ total: 2000, mode: 'drive', source: 'whatsapp' }),
      order({ total: 3000, mode: 'livraison', source: 'comptoir' }),
    ])
    expect(d.byMode).toEqual({ sur_place: 1000, drive: 2000, livraison: 3000 })
    expect(d.bySource).toEqual({ whatsapp: 3000, comptoir: 3000 })
  })
  it('renvoie un Z vide sans commande', () => {
    const d = computeCashDay([])
    expect(cashDayTotal(d)).toBe(0)
    expect(d.ordersCount).toBe(0)
    expect(d.byMode).toEqual({})
  })
})

describe('cashDayTotal / cashDifference', () => {
  it('additionne espèces et Airtel vérifié', () => {
    expect(cashDayTotal({ cashTotal: 4000, airtelTotal: 6000 })).toBe(10000)
  })
  it('calcule l’écart de caisse (négatif = manquant)', () => {
    expect(cashDifference(9500, 10000)).toBe(-500)
    expect(cashDifference(10000, 10000)).toBe(0)
    expect(cashDifference(10500, 10000)).toBe(500)
  })
  it('renvoie null si rien n’a été compté', () => {
    expect(cashDifference(null, 10000)).toBeNull()
    expect(cashDifference(undefined, 10000)).toBeNull()
    expect(cashDifference(Number.NaN, 10000)).toBeNull()
  })
})
