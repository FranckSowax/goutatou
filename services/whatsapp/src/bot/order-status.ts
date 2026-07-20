import type { OrderMode, OrderStatus } from '@goutatou/db'

/**
 * Mot-clé global « où en est ma commande » (lot C3 « UX bot », correctif 2) — reconnaissance PURE
 * des formulations naturelles. Partagé par la machine (routage global, cf. bot/machine.ts) et par
 * le processor (qui n'injecte `ctx.activeOrder` que sur ce mot-clé, pour ne pas ajouter une
 * requête à chaque message — même approche que `ctx.wheel` sur « roue »).
 */

/**
 * Normalise agressivement (mirror drive/arrival.ts) : minuscules, accents retirés, ponctuation et
 * emoji remplacés par un espace, espaces multiples réduits, trim. « Où en est ma commande ? » et
 * « ou en est ma commande » donnent donc la même chaîne.
 */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Formulations acceptées, en forme NORMALISÉE. Match STRICT sur la phrase entière (pas de
 * correspondance partielle) : « je veux commander » ou une adresse de livraison contenant le mot
 * « commande » ne doivent JAMAIS être avalées par ce mot-clé — même politique que `isArrivalText`.
 */
const PHRASES = new Set([
  'commande',
  'ma commande',
  'mes commandes',
  'statut',
  'statut commande',
  'statut de commande',
  'statut de ma commande',
  'suivi',
  'suivi commande',
  'suivi de commande',
  'suivi de ma commande',
  'ou en est ma commande',
  'ou en est la commande',
  'ou en est mon plat',
  'ou est ma commande',
  'ou en est ma livraison',
])

export function isOrderStatusKeyword(input: string): boolean {
  return PHRASES.has(normalize(input))
}

/** Commande active du client telle qu'injectée dans le contexte machine (cf. repo.getActiveOrder). */
export interface ActiveOrderInfo {
  orderNumber: number
  status: OrderStatus
  mode: OrderMode
  total: number
}
