import { describe, expect, it } from 'vitest'
import { driveBadge, groupByStatus, nextStatus, KANBAN_COLUMNS, type OrderCard } from '../src/lib/orders'

const order = (id: string, status: OrderCard['status'], overrides: Partial<OrderCard> = {}): OrderCard => ({
  id, order_number: 1, status, mode: 'drive', total: 1000, created_at: '2026-07-07T12:00:00Z',
  customer_name: null, customer_phone: '24177', drive_slot_label: null, delivery_address: null, items: [],
  arrived_at: null, arrival_note: null, verified_at: null,
  ...overrides,
})

describe('kanban helpers', () => {
  it('groupByStatus répartit les commandes par colonne', () => {
    const grouped = groupByStatus([order('a', 'recue'), order('b', 'prete'), order('c', 'recue')])
    expect(grouped.recue.map((o) => o.id)).toEqual(['a', 'c'])
    expect(grouped.prete).toHaveLength(1)
    expect(grouped.en_preparation).toHaveLength(0)
  })
  it('nextStatus suit le flux et s’arrête à recuperee', () => {
    expect(nextStatus('recue')).toBe('en_preparation')
    expect(nextStatus('en_preparation')).toBe('prete')
    expect(nextStatus('prete')).toBe('recuperee')
    expect(nextStatus('recuperee')).toBeNull()
    expect(nextStatus('annulee')).toBeNull()
  })
  it('KANBAN_COLUMNS expose 4 colonnes dans l’ordre du flux', () => {
    expect(KANBAN_COLUMNS.map((c) => c.status)).toEqual(['recue', 'en_preparation', 'prete', 'recuperee'])
  })
})

describe('driveBadge', () => {
  it('mode ≠ drive → null (pas de badge)', () => {
    expect(driveBadge(order('a', 'recue', { mode: 'livraison' }))).toBeNull()
    expect(driveBadge(order('a', 'recue', { mode: 'sur_place' }))).toBeNull()
  })

  it('drive sans arrivée → badge "🚗 Drive", pas de title', () => {
    expect(driveBadge(order('a', 'prete'))).toEqual({ label: '🚗 Drive', arrived: false, title: null })
  })

  it('drive + arrived_at posé → badge "🚗 ARRIVÉ", arrival_note en title', () => {
    const o = order('a', 'prete', { arrived_at: '2026-07-16T10:00:00Z', arrival_note: 'Toyota blanche' })
    expect(driveBadge(o)).toEqual({ label: '🚗 ARRIVÉ', arrived: true, title: 'Toyota blanche' })
  })

  it('drive + arrived_at posé mais arrival_note absente → title null', () => {
    const o = order('a', 'prete', { arrived_at: '2026-07-16T10:00:00Z', arrival_note: null })
    expect(driveBadge(o)).toEqual({ label: '🚗 ARRIVÉ', arrived: true, title: null })
  })
})
