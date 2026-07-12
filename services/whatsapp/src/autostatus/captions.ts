import { formatFcfa } from '@goutatou/db'

/** Sous-ensemble d'un plat requis par le moteur de légendes (pas de dépendance au type CatalogItem). */
export interface CaptionDish {
  name: string
  price: number
}

// CTA fixe confirmé par la spec (docs/superpowers/specs/2026-07-12-studio-statuts-design.md).
const CTA = '📲 Commandez-nous sur WhatsApp !'

/**
 * Moteur de légendes PURE, dupliqué côté web (même contrat : accroche + plat + prix formatFcfa +
 * CTA). ≥6 gabarits FR variés pour éviter la répétition visuelle sur les statuts consécutifs —
 * le worker choisit l'index (rotation cursor), cette fonction reste sans effet de bord ni horloge.
 */
const TEMPLATES: ((dish: CaptionDish) => string)[] = [
  (dish) => `🔥 À ne pas manquer aujourd'hui !\n${dish.name} — ${formatFcfa(dish.price)}\n${CTA}`,
  (dish) => `😋 Envie de se régaler ?\n${dish.name} à seulement ${formatFcfa(dish.price)}.\n${CTA}`,
  (dish) => `👀 Notre coup de cœur du jour : ${dish.name}\nÀ ${formatFcfa(dish.price)} seulement !\n${CTA}`,
  (dish) => `⏰ Disponible maintenant : ${dish.name}\nPrix : ${formatFcfa(dish.price)}\n${CTA}`,
  (dish) => `🍽️ ${dish.name}, ça vous tente ?\n${formatFcfa(dish.price)} — préparé avec soin.\n${CTA}`,
  (dish) => `✨ Fraîchement préparé : ${dish.name}\nÀ déguster pour ${formatFcfa(dish.price)}.\n${CTA}`,
  (dish) => `🙌 Toujours aussi populaire : ${dish.name}\n${formatFcfa(dish.price)} — servi chaud !\n${CTA}`,
]

export function buildStatusCaption(dish: CaptionDish, templateIndex: number): string {
  const n = TEMPLATES.length
  const idx = ((templateIndex % n) + n) % n
  return TEMPLATES[idx](dish)
}
