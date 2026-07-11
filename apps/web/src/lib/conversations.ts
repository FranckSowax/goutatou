import { normalizeGabonPhone } from './lp/wa'

export type ConversationDirection = 'in' | 'out'

export interface ConversationLog {
  id: string
  direction: ConversationDirection
  chat_id: string
  body: string | null
  error: string | null
  created_at: string
}

export interface ConversationCustomer {
  chat_id: string
  name: string | null
  phone: string
}

export interface ConversationSummary {
  chatId: string
  customerName: string
  phone: string | null
  lastBody: string
  lastAt: string
  lastDirection: ConversationDirection
  unreadCandidate: boolean
}

const EXTRACT_MAX_LEN = 80

/** Formate un numéro gabonais pour affichage ("+241 77 12 34 56"). Fallback : valeur brute si non reconnaissable. */
export function formatPhoneDisplay(raw: string): string {
  const normalized = normalizeGabonPhone(raw)
  const digits = normalized ?? raw.replace(/\D/g, '')
  if (!digits || digits.length < 8) return raw
  const local = digits.startsWith('241') ? digits.slice(3) : digits
  const groups = local.match(/.{1,2}/g) ?? [local]
  return `+241 ${groups.join(' ')}`
}

function truncateBody(body: string | null): string {
  if (!body) return '—'
  return body.length > EXTRACT_MAX_LEN ? `${body.slice(0, EXTRACT_MAX_LEN)}…` : body
}

/** Regroupe les logs par chat_id (1 entrée par conversation), triées par dernier message desc. */
export function groupConversations(
  logs: ConversationLog[],
  customers: ConversationCustomer[],
): ConversationSummary[] {
  const customerByChat = new Map(customers.map((c) => [c.chat_id, c]))
  const logsByChat = new Map<string, ConversationLog[]>()
  for (const l of logs) {
    const bucket = logsByChat.get(l.chat_id)
    if (bucket) bucket.push(l)
    else logsByChat.set(l.chat_id, [l])
  }

  const summaries: ConversationSummary[] = []
  for (const [chatId, chatLogs] of logsByChat) {
    const last = chatLogs.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a))
    const customer = customerByChat.get(chatId)
    const name = customer?.name?.trim()
    const phoneSource = customer?.phone ?? chatId.split('@')[0]
    summaries.push({
      chatId,
      customerName: name ? name : formatPhoneDisplay(phoneSource),
      phone: customer?.phone ?? null,
      lastBody: truncateBody(last.body),
      lastAt: last.created_at,
      lastDirection: last.direction,
      unreadCandidate: last.direction === 'in',
    })
  }

  summaries.sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
  return summaries
}

/** Fil de messages d'un chat, triés par created_at croissant. */
export function threadFor(logs: ConversationLog[], chatId: string): ConversationLog[] {
  return logs
    .filter((l) => l.chat_id === chatId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
}
