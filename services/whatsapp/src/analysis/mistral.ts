import { EMPTY_INSIGHTS, type AiInsights } from './types.js'

const ENDPOINT = 'https://api.mistral.ai/v1/chat/completions'
const MODEL = 'mistral-large-latest'

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
}

/**
 * Coerce le contenu JSON renvoyé par Mistral en `AiInsights` sûr : chaque champ manquant/mal typé
 * retombe sur son défaut vide. Ne jette jamais — un JSON invalide renvoie `EMPTY_INSIGHTS`.
 */
export function parseInsights(content: string): AiInsights {
  let raw: unknown
  try {
    raw = JSON.parse(content)
  } catch {
    return { ...EMPTY_INSIGHTS }
  }
  const o = (raw ?? {}) as Record<string, unknown>
  const sentiment = (o.sentiment ?? {}) as Record<string, unknown>
  const faq = Array.isArray(o.faq)
    ? (o.faq as unknown[])
        .map((f) => {
          const r = (f ?? {}) as Record<string, unknown>
          return {
            question: typeof r.question === 'string' ? r.question : '',
            reponse_suggeree: typeof r.reponse_suggeree === 'string' ? r.reponse_suggeree : '',
          }
        })
        .filter((f) => f.question || f.reponse_suggeree)
    : []

  return {
    resume_executif: typeof o.resume_executif === 'string' ? o.resume_executif : '',
    demandes: asStringArray(o.demandes),
    plats_preferes: asStringArray(o.plats_preferes),
    demandes_non_satisfaites: asStringArray(o.demandes_non_satisfaites),
    faq,
    sentiment: {
      note: typeof sentiment.note === 'number' ? sentiment.note : 0,
      resume: typeof sentiment.resume === 'string' ? sentiment.resume : '',
    },
    frictions: asStringArray(o.frictions),
    actions_marketing: asStringArray(o.actions_marketing).slice(0, 3),
  }
}

/**
 * Appelle Mistral (chat completions, JSON mode) et renvoie des insights validés. 1 réessai sur
 * échec réseau/HTTP. Jette en dernier ressort — l'appelant (worker) logge et passe au resto suivant.
 */
export async function callMistral(
  apiKey: string,
  messages: { system: string; user: string },
): Promise<AiInsights> {
  const body = JSON.stringify({
    model: MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: messages.system },
      { role: 'user', content: messages.user },
    ],
  })

  let lastErr: unknown
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body,
        signal: AbortSignal.timeout(60000),
      })
      if (!res.ok) throw new Error(`Mistral HTTP ${res.status}`)
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      const content = data?.choices?.[0]?.message?.content ?? '{}'
      return parseInsights(content)
    } catch (err) {
      lastErr = err
      if (attempt === 0) await new Promise((r) => setTimeout(r, 1500))
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Mistral: échec inconnu')
}

export { MODEL as MISTRAL_MODEL }
