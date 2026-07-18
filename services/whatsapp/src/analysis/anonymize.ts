export interface RawMessage {
  direction: 'in' | 'out'
  body: string | null
}

export interface CleanMessage {
  role: 'client' | 'bot'
  text: string
}

/** Budget de caractères envoyé à Mistral (coût/latence maîtrisés). */
export const MAX_CHARS = 24000

/**
 * Retire toute donnée personnelle d'un texte de message avant l'envoi à un tiers (Mistral) :
 * jid WhatsApp, uuid, et séquences de chiffres façon téléphone. On garde le SENS (« [numéro] »,
 * « [id] ») sans jamais laisser fuiter un identifiant réel.
 */
export function anonymizeText(input: string): string {
  return input
    // jid WhatsApp complet : 24177000001@s.whatsapp.net
    .replace(/[\w.-]+@s\.whatsapp\.net/gi, '[numéro]')
    // uuid
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]')
    // numéros de téléphone : 8 chiffres ou plus, avec séparateurs éventuels (+ ( ) . - espace)
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[numéro]')
    .trim()
}

/**
 * Anonymise et met en forme les messages pour le prompt d'analyse : mappe la direction en rôle
 * (`in`→client, `out`→bot), ignore les corps vides, et tronque au budget `MAX_CHARS` en gardant
 * les messages LES PLUS RÉCENTS (les derniers de la liste, supposée triée du plus ancien au plus
 * récent). `truncated` signale qu'une partie a été coupée.
 */
export function anonymizeMessages(rows: RawMessage[]): { messages: CleanMessage[]; truncated: boolean } {
  const clean: CleanMessage[] = []
  for (const r of rows) {
    const body = (r.body ?? '').trim()
    if (!body) continue
    clean.push({ role: r.direction === 'in' ? 'client' : 'bot', text: anonymizeText(body) })
  }

  const kept: CleanMessage[] = []
  let total = 0
  let truncated = false
  for (let i = clean.length - 1; i >= 0; i--) {
    const cost = clean[i].text.length + 12 // texte + préfixe de rôle approx.
    if (total + cost > MAX_CHARS) {
      truncated = clean.length > kept.length
      break
    }
    total += cost
    kept.push(clean[i])
  }
  kept.reverse()
  return { messages: kept, truncated }
}
