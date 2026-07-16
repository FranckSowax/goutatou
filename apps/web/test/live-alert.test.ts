import { describe, expect, it } from 'vitest'
import { decideAlert } from '../src/lib/live-alert'

function row(overrides: Partial<{
  id: string
  order_number: number
  total: number
  mode: string
  arrived_at: string | null
  arrival_note: string | null
}> = {}) {
  return {
    id: 'order-1',
    order_number: 42,
    total: 5000,
    mode: 'drive',
    arrived_at: null,
    arrival_note: null,
    ...overrides,
  }
}

describe('decideAlert', () => {
  it('INSERT neuf → alerte order', () => {
    const seen = new Set<string>()
    const evt = decideAlert({ type: 'INSERT', row: row() }, seen)
    expect(evt).toEqual({ kind: 'order', id: 'order-1', code: '42', amount: 5000 })
    expect(seen.has('order-1')).toBe(true)
  })

  it('même INSERT reçu 2x (redélivrance Realtime) → null la 2e fois', () => {
    const seen = new Set<string>()
    decideAlert({ type: 'INSERT', row: row() }, seen)
    const second = decideAlert({ type: 'INSERT', row: row() }, seen)
    expect(second).toBeNull()
  })

  it('UPDATE arrived_at null → date → alerte arrival', () => {
    const seen = new Set<string>()
    const evt = decideAlert(
      {
        type: 'UPDATE',
        row: row({ arrived_at: '2026-07-16T10:00:00Z', arrival_note: 'Toyota blanche' }),
        oldArrivedAt: null,
      },
      seen,
    )
    expect(evt).toEqual({ kind: 'arrival', id: 'order-1', code: '42', note: 'Toyota blanche' })
    expect(seen.has('arr:order-1')).toBe(true)
  })

  it('le même UPDATE d\'arrivée reçu 2x → null la 2e fois', () => {
    const seen = new Set<string>()
    const evt = { type: 'UPDATE' as const, row: row({ arrived_at: '2026-07-16T10:00:00Z' }), oldArrivedAt: null }
    decideAlert(evt, seen)
    const second = decideAlert(evt, seen)
    expect(second).toBeNull()
  })

  it('UPDATE sans changement d\'arrived_at (déjà set, même valeur) → null', () => {
    const seen = new Set<string>()
    const evt = decideAlert(
      {
        type: 'UPDATE',
        row: row({ arrived_at: '2026-07-16T10:00:00Z' }),
        oldArrivedAt: '2026-07-16T10:00:00Z',
      },
      seen,
    )
    expect(evt).toBeNull()
  })

  it('UPDATE avec arrived_at toujours null → null', () => {
    const seen = new Set<string>()
    const evt = decideAlert(
      { type: 'UPDATE', row: row({ arrived_at: null }), oldArrivedAt: null },
      seen,
    )
    expect(evt).toBeNull()
  })

  it('un même id peut produire order PUIS arrival (clés id et arr:id distinctes)', () => {
    const seen = new Set<string>()
    const orderEvt = decideAlert({ type: 'INSERT', row: row() }, seen)
    const arrivalEvt = decideAlert(
      { type: 'UPDATE', row: row({ arrived_at: '2026-07-16T10:00:00Z' }), oldArrivedAt: null },
      seen,
    )
    expect(orderEvt?.kind).toBe('order')
    expect(arrivalEvt?.kind).toBe('arrival')
  })

  it('oldArrivedAt undefined (payload.old indisponible) + arrived_at non-null → arrival la 1re fois seulement', () => {
    const seen = new Set<string>()
    const first = decideAlert(
      { type: 'UPDATE', row: row({ arrived_at: '2026-07-16T10:00:00Z' }) },
      seen,
    )
    const second = decideAlert(
      { type: 'UPDATE', row: row({ arrived_at: '2026-07-16T10:00:00Z' }) },
      seen,
    )
    expect(first).toEqual({ kind: 'arrival', id: 'order-1', code: '42', note: null })
    expect(second).toBeNull()
  })
})
