import { describe, expect, it } from 'vitest'
import { decideAlert } from '../src/lib/live-alert'

function row(overrides: Partial<{
  id: string
  order_number: number
  total: number
  mode: string
  arrived_at: string | null
  arrival_note: string | null
  payment_status: string
  paid_at: string | null
}> = {}) {
  return {
    id: 'order-1',
    order_number: 42,
    total: 5000,
    mode: 'drive',
    arrived_at: null,
    arrival_note: null,
    payment_status: 'na',
    paid_at: null,
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

  it('UPDATE arrived_at null → date fraîche (maintenant) → alerte arrival', () => {
    const seen = new Set<string>()
    const evt = decideAlert(
      {
        type: 'UPDATE',
        row: row({ arrived_at: new Date().toISOString(), arrival_note: 'Toyota blanche' }),
        oldArrivedAt: null,
      },
      seen,
    )
    expect(evt).toEqual({ kind: 'arrival', id: 'order-1', code: '42', note: 'Toyota blanche' })
    expect(seen.has('arr:order-1')).toBe(true)
  })

  it('le même UPDATE d\'arrivée reçu 2x → null la 2e fois', () => {
    const seen = new Set<string>()
    const evt = { type: 'UPDATE' as const, row: row({ arrived_at: new Date().toISOString() }), oldArrivedAt: null }
    decideAlert(evt, seen)
    const second = decideAlert(evt, seen)
    expect(second).toBeNull()
  })

  it('UPDATE sans changement d\'arrived_at (déjà set, même valeur) → null', () => {
    const seen = new Set<string>()
    const sameTs = new Date().toISOString()
    const evt = decideAlert(
      {
        type: 'UPDATE',
        row: row({ arrived_at: sameTs }),
        oldArrivedAt: sameTs,
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
      { type: 'UPDATE', row: row({ arrived_at: new Date().toISOString() }), oldArrivedAt: null },
      seen,
    )
    expect(orderEvt?.kind).toBe('order')
    expect(arrivalEvt?.kind).toBe('arrival')
  })

  it('oldArrivedAt undefined (payload.old indisponible) + arrived_at non-null (frais) → arrival la 1re fois seulement', () => {
    const seen = new Set<string>()
    const freshTs = new Date().toISOString()
    const first = decideAlert(
      { type: 'UPDATE', row: row({ arrived_at: freshTs }) },
      seen,
    )
    const second = decideAlert(
      { type: 'UPDATE', row: row({ arrived_at: freshTs }) },
      seen,
    )
    expect(first).toEqual({ kind: 'arrival', id: 'order-1', code: '42', note: null })
    expect(second).toBeNull()
  })

  // IMPORTANT 1 (revue finale) : garde de fraîcheur — un onglet fraîchement ouvert démarre avec un
  // `Set` vide, donc sans cette garde une arrivée déjà ancienne (ex. 10 min avant l'ouverture de
  // l'onglet) déclencherait à tort l'overlay plein écran + carillon dès le premier UPDATE reçu.
  describe('garde de fraîcheur (arrivée périmée)', () => {
    it('arrived_at = maintenant → alerte', () => {
      const seen = new Set<string>()
      const evt = decideAlert(
        { type: 'UPDATE', row: row({ arrived_at: new Date().toISOString() }), oldArrivedAt: null },
        seen,
      )
      expect(evt?.kind).toBe('arrival')
    })

    it('arrived_at = il y a 5 minutes → null (arrivée périmée, pas de fausse alerte)', () => {
      const seen = new Set<string>()
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
      const evt = decideAlert(
        { type: 'UPDATE', row: row({ arrived_at: fiveMinAgo }), oldArrivedAt: null },
        seen,
      )
      expect(evt).toBeNull()
      // Pas d'écriture dans `seen` non plus : une arrivée périmée ne doit pas non plus bloquer
      // une future redélivrance légitime (aucune garantie requise ici, mais aucune régression).
    })

    it('arrived_at invalide/non parsable → null, jamais de crash', () => {
      const seen = new Set<string>()
      expect(() =>
        decideAlert(
          { type: 'UPDATE', row: row({ arrived_at: 'pas-une-date' }), oldArrivedAt: null },
          seen,
        ),
      ).not.toThrow()
      const evt = decideAlert(
        { type: 'UPDATE', row: row({ arrived_at: 'pas-une-date' }), oldArrivedAt: null },
        seen,
      )
      expect(evt).toBeNull()
    })
  })

  // Paiement à la commande (Airtel manuel) : l'INSERT `a_verifier` est silencieux, c'est la
  // validation « Paiement reçu ✓ » (UPDATE → 'paye') qui déclenche l'alerte — une seule fois.
  describe('paiement Airtel', () => {
    it('INSERT payment_status=a_verifier → null (pas d\'alerte tant que non payé)', () => {
      const seen = new Set<string>()
      const evt = decideAlert({ type: 'INSERT', row: row({ payment_status: 'a_verifier' }) }, seen)
      expect(evt).toBeNull()
    })

    it('INSERT payment_status=na (cash / historique) → alerte order (comportement actuel)', () => {
      const seen = new Set<string>()
      const evt = decideAlert({ type: 'INSERT', row: row({ payment_status: 'na' }) }, seen)
      expect(evt).toEqual({ kind: 'order', id: 'order-1', code: '42', amount: 5000 })
    })

    it('UPDATE a_verifier → paye (frais) → alerte order, une seule fois', () => {
      const seen = new Set<string>()
      const paid = row({ payment_status: 'paye', paid_at: new Date().toISOString() })
      const first = decideAlert(
        { type: 'UPDATE', row: paid, oldPaymentStatus: 'a_verifier' },
        seen,
      )
      const second = decideAlert(
        { type: 'UPDATE', row: paid, oldPaymentStatus: 'a_verifier' },
        seen,
      )
      expect(first).toEqual({ kind: 'order', id: 'order-1', code: '42', amount: 5000 })
      expect(second).toBeNull()
    })

    it('UPDATE déjà payé (old=paye) → null (pas de re-sonnerie sur un autre changement)', () => {
      const seen = new Set<string>()
      const evt = decideAlert(
        {
          type: 'UPDATE',
          row: row({ payment_status: 'paye', paid_at: new Date().toISOString() }),
          oldPaymentStatus: 'paye',
        },
        seen,
      )
      expect(evt).toBeNull()
    })

    it('UPDATE vers paye mais paid_at périmé (onglet fraîchement ouvert) → null', () => {
      const seen = new Set<string>()
      const evt = decideAlert(
        {
          type: 'UPDATE',
          row: row({ payment_status: 'paye', paid_at: new Date(Date.now() - 5 * 60_000).toISOString() }),
          oldPaymentStatus: 'a_verifier',
        },
        seen,
      )
      expect(evt).toBeNull()
    })
  })
})
