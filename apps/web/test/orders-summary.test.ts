import { describe, expect, it } from 'vitest'
import { orderItemsSummary } from '../src/lib/orders'

describe('orderItemsSummary', () => {
  it('retourne "" pour une liste vide', () => {
    expect(orderItemsSummary([])).toBe('')
  })

  it('un plat seul', () => {
    expect(orderItemsSummary([{ name: 'Poulet DG', qty: 2 }])).toBe('2× Poulet DG')
  })

  it('un plat + un supplément rattaché', () => {
    expect(
      orderItemsSummary([
        { name: 'Poulet DG', qty: 2 },
        { name: '↳ Sauce', qty: 1 },
      ]),
    ).toBe('2× Poulet DG +Sauce')
  })

  it('deux plats séparés par " · "', () => {
    expect(
      orderItemsSummary([
        { name: 'Poulet DG', qty: 2 },
        { name: 'Frites', qty: 1 },
      ]),
    ).toBe('2× Poulet DG · 1× Frites')
  })

  it('plat + plusieurs suppléments puis un second plat', () => {
    expect(
      orderItemsSummary([
        { name: 'Poulet DG', qty: 1 },
        { name: '↳ Sauce', qty: 1 },
        { name: '↳ Piment', qty: 1 },
        { name: 'Frites', qty: 1 },
      ]),
    ).toBe('1× Poulet DG +Sauce +Piment · 1× Frites')
  })

  it('supplément orphelin en tête (défensif) ne crashe pas', () => {
    expect(() => orderItemsSummary([{ name: '↳ Sauce', qty: 1 }])).not.toThrow()
    expect(orderItemsSummary([{ name: '↳ Sauce', qty: 1 }])).toBe('+Sauce')
  })
})
