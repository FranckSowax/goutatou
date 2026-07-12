// Aperçu de la légende générée par le moteur « Statuts Auto » — copie légère
// du rendu, dupliquée ici volontairement pour ne pas importer le bot depuis
// le web (services/whatsapp est un paquet à part), comme
// apps/web/src/app/admin/restaurants/[id]/bot-info-preview.ts pour les infos
// pratiques.
//
// SOURCE DE VÉRITÉ : services/whatsapp/src/autostatus/captions.ts
// (`buildStatusCaption(dish, templateIndex)`). Ce fichier bot a été construit
// en parallèle (tâche concurrente) pendant ST4 ; les 7 gabarits ci-dessous
// sont un MIRROIR EXACT du fichier bot tel qu'il existait au moment de cet
// export (relire les deux fichiers texte par texte si le bot évolue encore
// avant merge — ⚠️ ST5 doit reconfirmer l'identité des deux listes).
import { formatFcfa } from '@goutatou/db/types'

export interface AutoStatusDishPreview {
  name: string
  price: number
}

const CTA = '📲 Commandez-nous sur WhatsApp !'

const TEMPLATES: ((dish: AutoStatusDishPreview) => string)[] = [
  (dish) => `🔥 À ne pas manquer aujourd'hui !\n${dish.name} — ${formatFcfa(dish.price)}\n${CTA}`,
  (dish) => `😋 Envie de se régaler ?\n${dish.name} à seulement ${formatFcfa(dish.price)}.\n${CTA}`,
  (dish) => `👀 Notre coup de cœur du jour : ${dish.name}\nÀ ${formatFcfa(dish.price)} seulement !\n${CTA}`,
  (dish) => `⏰ Disponible maintenant : ${dish.name}\nPrix : ${formatFcfa(dish.price)}\n${CTA}`,
  (dish) => `🍽️ ${dish.name}, ça vous tente ?\n${formatFcfa(dish.price)} — préparé avec soin.\n${CTA}`,
  (dish) => `✨ Fraîchement préparé : ${dish.name}\nÀ déguster pour ${formatFcfa(dish.price)}.\n${CTA}`,
  (dish) => `🙌 Toujours aussi populaire : ${dish.name}\n${formatFcfa(dish.price)} — servi chaud !\n${CTA}`,
]

export const AUTO_STATUS_CAPTION_TEMPLATE_COUNT = TEMPLATES.length

/** Rendu pur de la légende d'aperçu — `templateIndex` tourne (modulo) sur les gabarits. */
export function buildStatusCaptionPreview(dish: AutoStatusDishPreview, templateIndex: number): string {
  const index = ((templateIndex % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length
  return TEMPLATES[index](dish)
}
