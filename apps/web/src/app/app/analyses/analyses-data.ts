import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  cancelRate,
  conversionRate,
  modeSplit,
  newVsReturning,
  sourceSplit,
  topItems,
} from '@/lib/stats'
import { normalizeGabonPhone } from '@/lib/lp/wa'
import { periodBounds, type AnalysisPeriod } from '@/lib/analytics-period'

export type { AnalysisPeriod } from '@/lib/analytics-period'

/**
 * Sortie structurée du modèle (JSON `ai_insights` stocké par le worker bot). Cette forme est
 * partagée avec le bot — elle doit rester identique côté génération et côté lecture.
 */
export interface AiInsights {
  resume_executif: string
  demandes: string[]
  plats_preferes: string[]
  demandes_non_satisfaites: string[]
  faq: { question: string; reponse_suggeree: string }[]
  sentiment: { note: number; resume: string }
  frictions: string[]
  actions_marketing: string[]
}

export interface AiReport {
  period_start: string
  period_end: string
  ai_insights: AiInsights
  headline: Record<string, unknown>
  generated_at: string
}

/** KPIs déterministes d'une période (commandes + conversations). */
export interface AnalysisKpis {
  orders: number
  revenue: number
  avgBasket: number
  cancelRate: number
  modeSplit: { mode: string; label: string; count: number }[]
  sourceSplit: { source: string; label: string; count: number }[]
  topItems: { name: string; qty: number; ca: number }[]
  chats: number
  messagesIn: number
  messagesOut: number
  conversionRate: number
  newCustomers: number
  returningCustomers: number
}

export interface AnalysesResult {
  kpis: AnalysisKpis
  previous: AnalysisKpis
  aiReport: AiReport | null
}

interface OrderRow {
  id: string
  status: string
  total: number
  mode: string
  source: string
  created_at: string
  customer_id: string | null
  customers: { name: string | null; phone: string | null } | null
  order_items: { name: string; qty: number; unit_price: number }[] | null
}

interface LogRow {
  direction: string
  chat_id: string
  created_at: string
}

/** Clé de rapprochement chat_id ↔ téléphone client : chiffres canoniques (241XXXXXXXX) ou `null`. */
function phoneKey(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.split('@')[0].replace(/\D/g, '')
  if (digits.length < 8) return null
  return normalizeGabonPhone(digits) ?? digits
}

/** Garde-fou : borne une liste inconnue en `string[]`. */
function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
}

/** Normalise le JSON `ai_insights` (jamais de crash si un champ manque ou est mal typé). */
function normalizeInsights(raw: unknown): AiInsights {
  const o = (raw ?? {}) as Record<string, unknown>
  const sentiment = (o.sentiment ?? {}) as Record<string, unknown>
  const faq = Array.isArray(o.faq) ? (o.faq as Record<string, unknown>[]) : []
  return {
    resume_executif: typeof o.resume_executif === 'string' ? o.resume_executif : '',
    demandes: asStringList(o.demandes),
    plats_preferes: asStringList(o.plats_preferes),
    demandes_non_satisfaites: asStringList(o.demandes_non_satisfaites),
    faq: faq.map((f) => ({
      question: typeof f.question === 'string' ? f.question : '',
      reponse_suggeree: typeof f.reponse_suggeree === 'string' ? f.reponse_suggeree : '',
    })).filter((f) => f.question || f.reponse_suggeree),
    sentiment: {
      note: typeof sentiment.note === 'number' ? sentiment.note : 0,
      resume: typeof sentiment.resume === 'string' ? sentiment.resume : '',
    },
    frictions: asStringList(o.frictions),
    actions_marketing: asStringList(o.actions_marketing),
  }
}

/** Vrai si le rapport IA n'apporte aucun contenu exploitable (toutes sections vides). */
export function isInsightsEmpty(ai: AiInsights): boolean {
  return (
    ai.resume_executif.trim() === '' &&
    ai.demandes.length === 0 &&
    ai.plats_preferes.length === 0 &&
    ai.demandes_non_satisfaites.length === 0 &&
    ai.faq.length === 0 &&
    ai.frictions.length === 0 &&
    ai.actions_marketing.length === 0 &&
    ai.sentiment.resume.trim() === ''
  )
}

function computeKpis(orders: OrderRow[], logs: LogRow[]): AnalysisKpis {
  const live = orders.filter((o) => o.status !== 'annulee')
  const revenue = live.reduce((sum, o) => sum + (o.total ?? 0), 0)
  const count = live.length
  const items = orders.flatMap((o) => o.order_items ?? [])

  const chatIds = new Set<string>()
  let messagesIn = 0
  let messagesOut = 0
  const writerKeys: string[] = []
  for (const l of logs) {
    chatIds.add(l.chat_id)
    if (l.direction === 'in') {
      messagesIn += 1
      const k = phoneKey(l.chat_id)
      if (k) writerKeys.push(k)
    } else if (l.direction === 'out') {
      messagesOut += 1
    }
  }
  const orderKeys: string[] = []
  for (const o of live) {
    const k = phoneKey(o.customers?.phone)
    if (k) orderKeys.push(k)
  }

  return {
    orders: count,
    revenue,
    avgBasket: count > 0 ? Math.round(revenue / count) : 0,
    cancelRate: cancelRate(orders),
    modeSplit: modeSplit(orders),
    sourceSplit: sourceSplit(orders),
    topItems: topItems(items, 5),
    chats: chatIds.size,
    messagesIn,
    messagesOut,
    conversionRate: conversionRate(writerKeys, orderKeys),
    // Renseignés par getAnalyses (nécessite la table customers, absente ici).
    newCustomers: 0,
    returningCustomers: 0,
  }
}

/**
 * Analyses d'un restaurant pour une période : KPIs déterministes (période courante + précédente
 * pour les Δ%) calculés en direct, et dernier rapport IA archivé (lu depuis `analysis_reports`).
 * Scoping restaurant via `.eq('restaurant_id', …)` (+ RLS). Jamais de crash si l'IA est absente.
 */
export async function getAnalyses(
  supabase: SupabaseClient,
  restaurantId: string,
  period: AnalysisPeriod,
): Promise<AnalysesResult> {
  const bounds = periodBounds(period, new Date())
  const windowStart = bounds.previous.startUtc
  const windowEnd = bounds.current.endUtc

  const [ordersRes, logsRes, customersRes, reportRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id, status, total, mode, source, created_at, customer_id, customers(name, phone), order_items(name, qty, unit_price)',
      )
      .eq('restaurant_id', restaurantId)
      .gte('created_at', windowStart)
      .lt('created_at', windowEnd),
    supabase
      .from('message_logs')
      .select('direction, chat_id, created_at')
      .eq('restaurant_id', restaurantId)
      .gte('created_at', windowStart)
      .lt('created_at', windowEnd),
    supabase.from('customers').select('id, created_at').eq('restaurant_id', restaurantId),
    supabase
      .from('analysis_reports')
      .select('period_start, period_end, ai_insights, headline, generated_at')
      .eq('restaurant_id', restaurantId)
      .eq('period_type', period)
      // Rapport de la période EXACTE affichée (mêmes bornes que les KPIs), pas juste le dernier —
      // sinon le récit IA pourrait décrire une autre fenêtre que les chiffres.
      .eq('period_start', bounds.startYmd)
      .maybeSingle(),
  ])

  const allOrders = (ordersRes.data ?? []) as unknown as OrderRow[]
  const allLogs = (logsRes.data ?? []) as unknown as LogRow[]
  const customers = (customersRes.data ?? []) as { id: string; created_at: string }[]

  const curStart = bounds.current.startUtc
  const ordersCurrent = allOrders.filter((o) => o.created_at >= curStart)
  const ordersPrevious = allOrders.filter((o) => o.created_at < curStart)
  const logsCurrent = allLogs.filter((l) => l.created_at >= curStart)
  const logsPrevious = allLogs.filter((l) => l.created_at < curStart)

  const kpis = computeKpis(ordersCurrent, logsCurrent)
  const previous = computeKpis(ordersPrevious, logsPrevious)

  // nouveaux vs récurrents avec la date de création client (impossible dans computeKpis, qui n'a
  // pas la table customers) : on recalcule ici avec la borne de début de chaque période.
  const nvrCur = newVsReturning(
    ordersCurrent.map((o) => ({ customer_id: o.customer_id ?? '', status: o.status })),
    customers,
    curStart,
  )
  const nvrPrev = newVsReturning(
    ordersPrevious.map((o) => ({ customer_id: o.customer_id ?? '', status: o.status })),
    customers,
    bounds.previous.startUtc,
  )
  kpis.newCustomers = nvrCur.nouveaux
  kpis.returningCustomers = nvrCur.recurrents
  previous.newCustomers = nvrPrev.nouveaux
  previous.returningCustomers = nvrPrev.recurrents

  const reportRow = reportRes.data
  const aiReport: AiReport | null = reportRow
    ? {
        period_start: reportRow.period_start as string,
        period_end: reportRow.period_end as string,
        ai_insights: normalizeInsights(reportRow.ai_insights),
        headline: (reportRow.headline ?? {}) as Record<string, unknown>,
        generated_at: reportRow.generated_at as string,
      }
    : null

  return { kpis, previous, aiReport }
}
