import type { CleanMessage } from './anonymize.js'
import type { Headline } from './types.js'

const SYSTEM = `Tu es un analyste marketing pour un restaurant en Afrique centrale (Gabon, marché CEMAC, WhatsApp-first, prix en FCFA). On te donne les conversations WhatsApp anonymisées entre les clients et le bot du restaurant sur une période, plus quelques chiffres.

Ta mission : faire ressortir ce qui aide le restaurateur à décider. Réponds UNIQUEMENT avec un objet JSON valide, en français, sans aucun texte hors du JSON, selon EXACTEMENT ce schéma :
{
  "resume_executif": string,               // 3 à 5 phrases : l'état du resto sur la période
  "demandes": string[],                    // ce que les clients demandent le plus (plats, horaires, livraison, prix)
  "plats_preferes": string[],              // plats mentionnés positivement / plébiscités
  "demandes_non_satisfaites": string[],    // plats demandés mais absents/en rupture, opportunités de carte
  "faq": [{"question": string, "reponse_suggeree": string}],  // questions fréquentes + réponse type à automatiser
  "sentiment": {"note": number, "resume": string},  // note de 0 à 10 (satisfaction globale) + une phrase
  "frictions": string[],                   // points de friction / plaintes récurrentes
  "actions_marketing": string[]            // AU PLUS 3 actions concrètes et priorisées pour la période à venir
}

Règles : n'invente rien. Si les données sont insuffisantes pour un champ, mets une liste vide (ou une chaîne vide / note 0). Base-toi uniquement sur les conversations fournies. Sois concret et actionnable.`

export function buildAnalysisPrompt(
  periodLabel: string,
  messages: CleanMessage[],
  headline: Headline,
  truncated: boolean,
): { system: string; user: string } {
  const convo = messages.map((m) => `[${m.role}] ${m.text}`).join('\n')
  const user =
    `Période analysée : ${periodLabel}.\n` +
    `Chiffres de la période : ${headline.orders} commande(s), ${headline.revenue} FCFA de chiffre d'affaires, ` +
    `${headline.conversations} conversation(s).\n` +
    (truncated ? `(Extrait des messages les plus récents — le volume total a été tronqué.)\n` : '') +
    `\nConversations anonymisées :\n${convo || '(aucun message sur la période)'}`
  return { system: SYSTEM, user }
}
