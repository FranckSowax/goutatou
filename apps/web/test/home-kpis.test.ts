import { describe, expect, it } from 'vitest'
import { computeHomeKpis, type HomeOrderInput } from '../src/lib/home'

const order = (status: HomeOrderInput['status'], total: number, created_at: string): HomeOrderInput => ({
  status, total, created_at,
})

describe('computeHomeKpis', () => {
  it('calcule CA du jour, en cours, prêtes et panier moyen à partir de commandes mixtes', () => {
    const todayIso = '2026-07-10T12:00:00Z'
    const orders: HomeOrderInput[] = [
      order('recue', 5000, '2026-07-10T09:00:00Z'), // aujourd'hui, en cours
      order('en_preparation', 3000, '2026-07-10T10:00:00Z'), // aujourd'hui, en cours
      order('prete', 4000, '2026-07-10T11:00:00Z'), // aujourd'hui, prête
      order('annulee', 9999, '2026-07-10T08:00:00Z'), // aujourd'hui mais annulée → exclue du CA
      order('recuperee', 2000, '2026-07-09T10:00:00Z'), // hier, récupérée
      order('recue', 1500, '2026-07-09T09:00:00Z'), // hier, mais toujours en cours
    ]

    const kpis = computeHomeKpis(orders, todayIso)

    expect(kpis.enCours).toBe(3) // les 2 recue + 1 en_preparation, peu importe le jour
    expect(kpis.pretes).toBe(1)
    expect(kpis.caJour).toBe(12000) // 5000 + 3000 + 4000, hors annulée et hors hier
    expect(kpis.panierMoyen).toBe(4000) // 12000 / 3 commandes du jour
  })

  it('ne divise pas par zéro quand aucune commande n’a été passée aujourd’hui', () => {
    const todayIso = '2026-07-10T12:00:00Z'
    const orders: HomeOrderInput[] = [
      order('recuperee', 2000, '2026-07-09T10:00:00Z'),
      order('annulee', 5000, '2026-07-09T10:00:00Z'),
    ]

    const kpis = computeHomeKpis(orders, todayIso)

    expect(kpis.caJour).toBe(0)
    expect(kpis.panierMoyen).toBe(0)
    expect(kpis.enCours).toBe(0)
    expect(kpis.pretes).toBe(0)
  })

  it('retourne des zéros pour une liste vide', () => {
    const kpis = computeHomeKpis([], '2026-07-10T12:00:00Z')
    expect(kpis).toEqual({ caJour: 0, enCours: 0, pretes: 0, panierMoyen: 0 })
  })

  it('compte dans le CA du jour une commande UTC de la veille qui tombe déjà le jour J à Libreville (UTC+1)', () => {
    const todayIso = '2026-07-10T12:00:00Z' // 13:00 le 10/07 à Libreville
    const orders: HomeOrderInput[] = [
      order('recuperee', 7000, '2026-07-09T23:30:00Z'), // 00:30 le 10/07 à Libreville → compte dans le jour J
    ]

    const kpis = computeHomeKpis(orders, todayIso)

    expect(kpis.caJour).toBe(7000)
    expect(kpis.panierMoyen).toBe(7000)
  })
})
