import { describe, expect, it } from 'vitest'
import { cancelRate, newVsReturning, pctDelta, sourceSplit, weekdayCa } from '../src/lib/stats'

describe('pctDelta', () => {
  it('calcule une hausse en %', () => {
    expect(pctDelta(150, 100)).toBe(50)
  })

  it('calcule une baisse en %', () => {
    expect(pctDelta(50, 100)).toBe(-50)
  })

  it('retourne null si la période précédente est à 0 (pas de base de comparaison)', () => {
    expect(pctDelta(10, 0)).toBeNull()
  })

  it('retourne null si les deux périodes sont à 0', () => {
    expect(pctDelta(0, 0)).toBeNull()
  })

  it('arrondit le résultat', () => {
    expect(pctDelta(133, 100)).toBe(33)
    expect(pctDelta(1, 3)).toBe(-67)
  })
})

describe('weekdayCa', () => {
  it('cumule le CA par jour de semaine sur 7 jours, ordre Lun→Dim, annulée exclue', () => {
    const now = new Date('2026-07-10T12:00:00Z') // vendredi 13:00 Libreville
    const orders = [
      { status: 'recuperee', total: 100, created_at: '2026-07-04T09:00:00Z' }, // samedi
      { status: 'recuperee', total: 200, created_at: '2026-07-05T09:00:00Z' }, // dimanche
      { status: 'recuperee', total: 300, created_at: '2026-07-06T09:00:00Z' }, // lundi
      { status: 'recuperee', total: 400, created_at: '2026-07-07T09:00:00Z' }, // mardi
      { status: 'recuperee', total: 500, created_at: '2026-07-08T09:00:00Z' }, // mercredi
      { status: 'recuperee', total: 600, created_at: '2026-07-09T09:00:00Z' }, // jeudi
      { status: 'recuperee', total: 700, created_at: '2026-07-10T09:00:00Z' }, // vendredi
      { status: 'annulee', total: 9999, created_at: '2026-07-10T09:30:00Z' }, // vendredi, exclue
    ]

    const result = weekdayCa(orders, now, 7)

    expect(result.map((d) => d.label)).toEqual(['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'])
    expect(result).toEqual([
      { label: 'Lun', ca: 300 },
      { label: 'Mar', ca: 400 },
      { label: 'Mer', ca: 500 },
      { label: 'Jeu', ca: 600 },
      { label: 'Ven', ca: 700 },
      { label: 'Sam', ca: 100 },
      { label: 'Dim', ca: 200 },
    ])
  })

  it('jours de semaine sans CA à 0', () => {
    const now = new Date('2026-07-10T12:00:00Z')
    const orders = [
      { status: 'recuperee', total: 300, created_at: '2026-07-06T09:00:00Z' }, // lundi
    ]

    const result = weekdayCa(orders, now, 7)

    expect(result).toEqual([
      { label: 'Lun', ca: 300 },
      { label: 'Mar', ca: 0 },
      { label: 'Mer', ca: 0 },
      { label: 'Jeu', ca: 0 },
      { label: 'Ven', ca: 0 },
      { label: 'Sam', ca: 0 },
      { label: 'Dim', ca: 0 },
    ])
  })

  it('ignore les commandes hors fenêtre', () => {
    const now = new Date('2026-07-10T12:00:00Z')
    const orders = [
      { status: 'recuperee', total: 300, created_at: '2026-07-06T09:00:00Z' }, // dans la fenêtre 7j
      { status: 'recuperee', total: 999, created_at: '2026-06-01T09:00:00Z' }, // hors fenêtre
    ]

    const result = weekdayCa(orders, now, 7)
    const total = result.reduce((sum, d) => sum + d.ca, 0)
    expect(total).toBe(300)
  })
})

describe('newVsReturning', () => {
  it('distingue nouveaux (créés dans la fenêtre) et récurrents (créés avant)', () => {
    const sinceIso = '2026-07-01T00:00:00Z'
    const orders = [
      { customer_id: 'c1', status: 'recuperee' },
      { customer_id: 'c2', status: 'recuperee' },
    ]
    const customers = [
      { id: 'c1', created_at: '2026-07-05T00:00:00Z' }, // nouveau
      { id: 'c2', created_at: '2026-06-01T00:00:00Z' }, // récurrent
    ]

    expect(newVsReturning(orders, customers, sinceIso)).toEqual({ nouveaux: 1, recurrents: 1 })
  })

  it('dédoublonne un client ayant passé plusieurs commandes', () => {
    const sinceIso = '2026-07-01T00:00:00Z'
    const orders = [
      { customer_id: 'c1', status: 'recuperee' },
      { customer_id: 'c1', status: 'prete' },
    ]
    const customers = [{ id: 'c1', created_at: '2026-07-05T00:00:00Z' }]

    expect(newVsReturning(orders, customers, sinceIso)).toEqual({ nouveaux: 1, recurrents: 0 })
  })

  it('exclut les commandes annulées', () => {
    const sinceIso = '2026-07-01T00:00:00Z'
    const orders = [{ customer_id: 'c1', status: 'annulee' }]
    const customers = [{ id: 'c1', created_at: '2026-07-05T00:00:00Z' }]

    expect(newVsReturning(orders, customers, sinceIso)).toEqual({ nouveaux: 0, recurrents: 0 })
  })

  it('retourne des compteurs à 0 pour une liste de commandes vide', () => {
    expect(newVsReturning([], [], '2026-07-01T00:00:00Z')).toEqual({ nouveaux: 0, recurrents: 0 })
  })
})

describe('sourceSplit', () => {
  it('retourne un ordre fixe whatsapp/web/comptoir, y compris à 0', () => {
    const orders = [
      { status: 'recue', source: 'whatsapp' },
      { status: 'prete', source: 'whatsapp' },
    ]

    expect(sourceSplit(orders)).toEqual([
      { source: 'whatsapp', label: 'WhatsApp', count: 2 },
      { source: 'web', label: 'Site web', count: 0 },
      { source: 'comptoir', label: 'Comptoir', count: 0 },
    ])
  })

  it('exclut les commandes annulées', () => {
    const orders = [
      { status: 'annulee', source: 'web' },
      { status: 'recue', source: 'web' },
    ]

    expect(sourceSplit(orders).find((s) => s.source === 'web')?.count).toBe(1)
  })

  it('compte une commande comptoir sous "Comptoir"', () => {
    const orders = [
      { status: 'recue', source: 'comptoir' },
      { status: 'recue', source: 'web' },
    ]

    expect(sourceSplit(orders)).toEqual([
      { source: 'whatsapp', label: 'WhatsApp', count: 0 },
      { source: 'web', label: 'Site web', count: 1 },
      { source: 'comptoir', label: 'Comptoir', count: 1 },
    ])
  })

  it('retourne les 3 sources à 0 pour une liste vide', () => {
    expect(sourceSplit([])).toEqual([
      { source: 'whatsapp', label: 'WhatsApp', count: 0 },
      { source: 'web', label: 'Site web', count: 0 },
      { source: 'comptoir', label: 'Comptoir', count: 0 },
    ])
  })
})

describe('cancelRate', () => {
  it('calcule le % de commandes annulées sur le total (annulées incluses)', () => {
    const orders = [
      { status: 'annulee' },
      { status: 'recue' },
      { status: 'prete' },
      { status: 'recuperee' },
    ]

    expect(cancelRate(orders)).toBe(25)
  })

  it('retourne 0 si aucune commande', () => {
    expect(cancelRate([])).toBe(0)
  })

  it('arrondit le résultat', () => {
    const orders = [{ status: 'annulee' }, { status: 'recue' }, { status: 'recue' }]
    expect(cancelRate(orders)).toBe(33)
  })
})
