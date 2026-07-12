// Aperçu de la légende générée par le moteur « Statuts Auto » — copie légère
// du rendu, dupliquée ici volontairement pour ne pas importer le bot depuis
// le web (services/whatsapp est un paquet à part), comme
// apps/web/src/app/admin/restaurants/[id]/bot-info-preview.ts pour les infos
// pratiques.
//
// SOURCE DE VÉRITÉ : services/whatsapp/src/autostatus/captions.ts
// (`buildStatusCaption(dish, templateIndex)`). Au moment de l'écriture de ce
// fichier (tâche ST4), ce module bot était en cours de construction en
// parallèle (tâche concurrente) et n'existait PAS ENCORE dans l'arbre : les
// gabarits ci-dessous sont donc une IMPLÉMENTATION DU CONTRAT défini par la
// spec (§ Statuts Auto : ≥ 6 gabarits FR variés « accroche + nom du plat +
// prix formatFcfa + CTA 📲 Commandez-nous sur WhatsApp ! », rotation par
// templateIndex modulo), et PAS un mirroir exact du fichier bot final.
//
// ⚠️ TODO ST5 : reconcilier ce fichier avec services/whatsapp/src/autostatus/
// captions.ts une fois celui-ci mergé — comparer gabarit par gabarit et
// copier les textes exacts ici pour que l'aperçu web soit fidèle à ce qui
// sera réellement publié sur WhatsApp.
import { formatFcfa } from '@goutatou/db/types'

export interface AutoStatusDishPreview {
  name: string
  price: number
}

const CTA = '📲 Commandez-nous sur WhatsApp !'

const TEMPLATES: ((name: string, price: string) => string)[] = [
  (name, price) => `🔥 Aujourd’hui, on vous régale avec ${name} à ${price} !\n${CTA}`,
  (name, price) => `😋 Envie d’un bon plat ? ${name} vous attend à ${price}.\n${CTA}`,
  (name, price) => `👨‍🍳 Fraîchement préparé pour vous : ${name} — ${price} seulement.\n${CTA}`,
  (name, price) => `⭐ Le coup de cœur du jour : ${name} à ${price}.\n${CTA}`,
  (name, price) => `🍽️ On a pensé à vous : ${name} à ${price}, à ne pas manquer !\n${CTA}`,
  (name, price) => `✨ Nouveau sur la carte aujourd’hui : ${name} à ${price}.\n${CTA}`,
]

export const AUTO_STATUS_CAPTION_TEMPLATE_COUNT = TEMPLATES.length

/** Rendu pur de la légende d'aperçu — `templateIndex` tourne (modulo) sur les gabarits. */
export function buildStatusCaptionPreview(dish: AutoStatusDishPreview, templateIndex: number): string {
  const index = ((templateIndex % TEMPLATES.length) + TEMPLATES.length) % TEMPLATES.length
  return TEMPLATES[index](dish.name, formatFcfa(dish.price))
}
