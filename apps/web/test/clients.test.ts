import { describe, it, expect } from 'vitest'
import { buildClients, segmentOf, filterBySegment, searchClients, type RawCustomer, type RawOrder } from '../src/lib/clients'

const now = new Date('2026-07-18T12:00:00Z')

function customer(over: Partial<RawCustomer> & { id: string }): RawCustomer {
  return {
    id: over.id, name: over.name ?? 'Client', phone: over.phone ?? '24177000000',
    marketing_opt_in: over.marketing_opt_in ?? false, opted_out: over.opted_out ?? false,
    created_at: over.created_at ?? '2026-01-01T00:00:00Z', notes: over.notes ?? null,
  }
}

describe('buildClients', () => {
  it('agrège LTV, nb commandes, panier moyen, dernière commande, plat préféré', () => {
    const customers = [customer({ id: 'a' })]
    const orders: RawOrder[] = [
      { customer_id: 'a', total: 4000, status: 'recuperee', created_at: '2026-07-01T10:00:00Z', items: [{ name: 'Poulet DG', qty: 2 }, { name: '↳ Sauce', qty: 1 }] },
      { customer_id: 'a', total: 6000, status: 'recue', created_at: '2026-07-10T10:00:00Z', items: [{ name: 'Poulet DG', qty: 1 }, { name: 'Frites', qty: 3 }] },
      { customer_id: 'a', total: 9999, status: 'annulee', created_at: '2026-07-15T10:00:00Z', items: [{ name: 'X', qty: 9 }] },
    ]
    const [c] = buildClients(customers, orders)
    expect(c.ordersCount).toBe(2) // annulée exclue
    expect(c.ltv).toBe(10000)
    expect(c.avgBasket).toBe(5000)
    expect(c.lastOrderAt).toBe('2026-07-10T10:00:00Z')
    // Poulet DG = 2+1 = 3, Frites = 3 → égalité, le premier atteint (Poulet DG) gagne (comparaison stricte).
    expect(c.favoriteItem).toBe('Poulet DG')
  })
  it('trie par LTV décroissante', () => {
    const rows = buildClients(
      [customer({ id: 'a' }), customer({ id: 'b' })],
      [
        { customer_id: 'a', total: 1000, status: 'recue', created_at: '2026-07-01T00:00:00Z', items: [] },
        { customer_id: 'b', total: 5000, status: 'recue', created_at: '2026-07-01T00:00:00Z', items: [] },
      ],
    )
    expect(rows.map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('segmentOf', () => {
  const base = { id: 'x', name: null, phone: '2', ordersCount: 0, ltv: 0, lastOrderAt: null, avgBasket: 0, favoriteItem: null, marketingOptIn: false, optedOut: false, createdAt: '2026-01-01T00:00:00Z', notes: null }
  it('désabonné en priorité', () => {
    expect(segmentOf({ ...base, optedOut: true, ordersCount: 5 }, now)).toBe('desabonne')
  })
  it('fidèle si ≥3 commandes', () => {
    expect(segmentOf({ ...base, ordersCount: 3, lastOrderAt: '2026-07-17T00:00:00Z' }, now)).toBe('fidele')
  })
  it('inactif si >30j sans commande', () => {
    expect(segmentOf({ ...base, ordersCount: 1, lastOrderAt: '2026-05-01T00:00:00Z' }, now)).toBe('inactif')
  })
  it('nouveau si créé <30j et actif récent', () => {
    expect(segmentOf({ ...base, ordersCount: 1, lastOrderAt: '2026-07-15T00:00:00Z', createdAt: '2026-07-10T00:00:00Z' }, now)).toBe('nouveau')
  })
})

describe('filterBySegment / searchClients', () => {
  const rows = buildClients(
    [customer({ id: 'a', name: 'Awa', phone: '24177111111' }), customer({ id: 'b', name: 'Bob', phone: '24177222222', opted_out: true })],
    [],
  )
  it('filtre par segment', () => {
    expect(filterBySegment(rows, 'desabonne', now).map((r) => r.id)).toEqual(['b'])
    expect(filterBySegment(rows, 'tous', now)).toHaveLength(2)
  })
  it('recherche par nom et téléphone', () => {
    expect(searchClients(rows, 'awa').map((r) => r.id)).toEqual(['a'])
    expect(searchClients(rows, '222 222').map((r) => r.id)).toEqual(['b'])
  })
})
