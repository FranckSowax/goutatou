import { describe, expect, it } from 'vitest'
import { dailySeries, hourHistogram, modeSplit, planSplit, topItems } from '../src/lib/stats'

describe('dailySeries', () => {
  it('couvre une fenêtre continue de 3 jours, jour vide au milieu à 0', () => {
    const now = new Date('2026-07-10T12:00:00Z') // 13:00 Libreville
    const orders = [
      { status: 'recuperee', total: 5000, created_at: '2026-07-08T10:00:00Z' }, // 08/07
      // 09/07 : aucune commande → jour vide
      { status: 'recue', total: 3000, created_at: '2026-07-10T09:00:00Z' }, // 10/07
      { status: 'prete', total: 2000, created_at: '2026-07-10T10:00:00Z' }, // 10/07
    ]

    const series = dailySeries(orders, 3, now)

    expect(series).toHaveLength(3)
    expect(series.map((d) => d.label)).toEqual(['08/07', '09/07', '10/07'])
    expect(series[0]).toEqual({ label: '08/07', ca: 5000, count: 1 })
    expect(series[1]).toEqual({ label: '09/07', ca: 0, count: 0 })
    expect(series[2]).toEqual({ label: '10/07', ca: 5000, count: 2 })
  })

  it('exclut les commandes annulées du CA et du count', () => {
    const now = new Date('2026-07-10T12:00:00Z')
    const orders = [
      { status: 'recuperee', total: 1000, created_at: '2026-07-10T09:00:00Z' },
      { status: 'annulee', total: 9999, created_at: '2026-07-10T09:30:00Z' },
    ]

    const series = dailySeries(orders, 1, now)

    expect(series).toEqual([{ label: '10/07', ca: 1000, count: 1 }])
  })

  it('compte une commande UTC 23:30 de la veille dans le jour J à Libreville (UTC+1)', () => {
    const now = new Date('2026-07-10T12:00:00Z')
    const orders = [
      { status: 'recuperee', total: 7000, created_at: '2026-07-09T23:30:00Z' }, // 00:30 le 10/07 Libreville
    ]

    const series = dailySeries(orders, 1, now)

    expect(series).toEqual([{ label: '10/07', ca: 7000, count: 1 }])
  })

  it('retourne des jours à 0 sur une liste de commandes vide', () => {
    const now = new Date('2026-07-10T12:00:00Z')
    const series = dailySeries([], 2, now)
    expect(series).toEqual([
      { label: '09/07', ca: 0, count: 0 },
      { label: '10/07', ca: 0, count: 0 },
    ])
  })
})

describe('topItems', () => {
  it('agrège les doublons de nom (qty sommée, ca = Σ qty*unit_price) et trie par qty desc', () => {
    const items = [
      { name: 'Poulet Braisé', qty: 2, unit_price: 3000 },
      { name: 'Poisson Salé', qty: 6, unit_price: 4000 },
      { name: 'Poulet Braisé', qty: 3, unit_price: 3000 },
      { name: 'Riz Gras', qty: 1, unit_price: 2000 },
    ]

    const result = topItems(items, 10)

    expect(result).toEqual([
      { name: 'Poisson Salé', qty: 6, ca: 24000 },
      { name: 'Poulet Braisé', qty: 5, ca: 15000 },
      { name: 'Riz Gras', qty: 1, ca: 2000 },
    ])
  })

  it('respecte la limite', () => {
    const items = [
      { name: 'A', qty: 3, unit_price: 100 },
      { name: 'B', qty: 5, unit_price: 100 },
      { name: 'C', qty: 1, unit_price: 100 },
    ]

    const result = topItems(items, 2)

    expect(result).toEqual([
      { name: 'B', qty: 5, ca: 500 },
      { name: 'A', qty: 3, ca: 300 },
    ])
  })

  it('retourne un tableau vide pour une liste vide', () => {
    expect(topItems([], 5)).toEqual([])
  })
})

describe('modeSplit', () => {
  it('retourne un ordre fixe sur_place/drive/livraison, y compris à 0', () => {
    const orders = [
      { status: 'recue', mode: 'drive' },
      { status: 'prete', mode: 'drive' },
      { status: 'recuperee', mode: 'sur_place' },
    ]

    const result = modeSplit(orders)

    expect(result).toEqual([
      { mode: 'sur_place', label: 'Sur place', count: 1 },
      { mode: 'drive', label: 'Drive', count: 2 },
      { mode: 'livraison', label: 'Livraison', count: 0 },
    ])
  })

  it('exclut les commandes annulées', () => {
    const orders = [
      { status: 'annulee', mode: 'livraison' },
      { status: 'recue', mode: 'livraison' },
    ]

    const result = modeSplit(orders)

    expect(result.find((m) => m.mode === 'livraison')?.count).toBe(1)
  })

  it('retourne les 3 modes à 0 pour une liste vide', () => {
    expect(modeSplit([])).toEqual([
      { mode: 'sur_place', label: 'Sur place', count: 0 },
      { mode: 'drive', label: 'Drive', count: 0 },
      { mode: 'livraison', label: 'Livraison', count: 0 },
    ])
  })
})

describe('hourHistogram', () => {
  it('retourne 24 seaux (0-23) avec le bon mapping TZ Libreville', () => {
    const orders = [
      { status: 'recue', created_at: '2026-07-09T23:30:00Z' }, // 00:30 Libreville → heure 0
      { status: 'recue', created_at: '2026-07-10T11:00:00Z' }, // 12:00 Libreville → heure 12
      { status: 'recue', created_at: '2026-07-10T11:15:00Z' }, // 12:15 Libreville → heure 12
    ]

    const histogram = hourHistogram(orders)

    expect(histogram).toHaveLength(24)
    expect(histogram.map((h) => h.hour)).toEqual(Array.from({ length: 24 }, (_, i) => i))
    expect(histogram[0]).toEqual({ hour: 0, count: 1 })
    expect(histogram[12]).toEqual({ hour: 12, count: 2 })
    expect(histogram.reduce((sum, h) => sum + h.count, 0)).toBe(3)
  })

  it('exclut les commandes annulées', () => {
    const orders = [
      { status: 'annulee', created_at: '2026-07-10T11:00:00Z' },
      { status: 'recue', created_at: '2026-07-10T11:00:00Z' },
    ]

    const histogram = hourHistogram(orders)
    expect(histogram[12]).toEqual({ hour: 12, count: 1 })
    expect(histogram.reduce((sum, h) => sum + h.count, 0)).toBe(1)
  })

  it('retourne 24 seaux à 0 pour une liste vide', () => {
    const histogram = hourHistogram([])
    expect(histogram).toHaveLength(24)
    expect(histogram.every((h) => h.count === 0)).toBe(true)
  })
})

describe('planSplit', () => {
  it('retourne un ordre fixe starter/pro/premium, y compris à 0', () => {
    const rows = [{ plan: 'pro' }, { plan: 'starter' }, { plan: 'pro' }]

    const result = planSplit(rows)

    expect(result).toEqual([
      { plan: 'starter', count: 1 },
      { plan: 'pro', count: 2 },
      { plan: 'premium', count: 0 },
    ])
  })

  it('retourne les 3 plans à 0 pour une liste vide', () => {
    expect(planSplit([])).toEqual([
      { plan: 'starter', count: 0 },
      { plan: 'pro', count: 0 },
      { plan: 'premium', count: 0 },
    ])
  })
})
