import type { OrderStatus } from '@goutatou/db'

export interface HomeOrderInput {
  status: OrderStatus
  total: number
  created_at: string
}

export interface HomeKpis {
  caJour: number
  enCours: number
  pretes: number
  panierMoyen: number
}

const TIMEZONE = 'Africa/Libreville'

function localDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { timeZone: TIMEZONE })
}

/**
 * Calcule les 4 chiffres clés de l'Accueil à partir des commandes (fenêtre glissante,
 * typiquement 7 jours) et de la date de référence `todayIso` (ISO, ex : appelée avec
 * `new Date().toISOString()` côté page serveur pour rester déterministe en test).
 *
 * - enCours : commandes reçues ou en préparation, quel que soit leur jour (état opérationnel).
 * - pretes : commandes prêtes à récupérer, quel que soit leur jour.
 * - caJour / panierMoyen : uniquement les commandes du jour (todayIso), hors annulées.
 */
export function computeHomeKpis(orders: HomeOrderInput[], todayIso: string): HomeKpis {
  const today = localDate(todayIso)

  const enCours = orders.filter((o) => o.status === 'recue' || o.status === 'en_preparation').length
  const pretes = orders.filter((o) => o.status === 'prete').length

  const todayOrders = orders.filter((o) => o.status !== 'annulee' && localDate(o.created_at) === today)
  const caJour = todayOrders.reduce((sum, o) => sum + o.total, 0)
  const panierMoyen = todayOrders.length === 0 ? 0 : Math.round(caJour / todayOrders.length)

  return { caJour, enCours, pretes, panierMoyen }
}
