import type { SupabaseClient } from '@supabase/supabase-js'
import type { RawMessage } from './anonymize.js'
import type { AiInsights, Headline, Period } from './types.js'

export interface SaveReportInput {
  restaurantId: string
  period: Period
  headline: Headline
  insights: AiInsights
  model: string
}

export interface AnalysisRepo {
  listPremiumRestaurants(): Promise<string[]>
  reportExists(restaurantId: string, periodType: Period['type'], periodStart: string): Promise<boolean>
  loadConversations(restaurantId: string, startUtc: string, endUtc: string): Promise<RawMessage[]>
  loadHeadline(restaurantId: string, startUtc: string, endUtc: string): Promise<Headline>
  saveReport(input: SaveReportInput): Promise<void>
}

export function createAnalysisRepo(db: SupabaseClient): AnalysisRepo {
  return {
    async listPremiumRestaurants() {
      const { data } = await db
        .from('subscriptions')
        .select('restaurant_id')
        .eq('plan', 'premium')
        .eq('status', 'active')
      return (data ?? []).map((r) => r.restaurant_id as string)
    },

    async reportExists(restaurantId, periodType, periodStart) {
      const { data, error } = await db
        .from('analysis_reports')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .eq('period_type', periodType)
        .eq('period_start', periodStart)
        .maybeSingle()
      // Sur erreur de lecture, on JETTE (le worker saute ce resto/période ce tick) plutôt que de
      // renvoyer `false` — sinon un souci DB déclencherait une génération Mistral facturée pour rien.
      if (error) throw new Error(`reportExists: ${error.message}`)
      return !!data
    },

    async loadConversations(restaurantId, startUtc, endUtc) {
      const { data } = await db
        .from('message_logs')
        .select('direction, body, created_at')
        .eq('restaurant_id', restaurantId)
        .gte('created_at', startUtc)
        .lt('created_at', endUtc)
        .order('created_at', { ascending: true })
      return (data ?? []).map((r) => ({ direction: r.direction as 'in' | 'out', body: r.body as string | null }))
    },

    async loadHeadline(restaurantId, startUtc, endUtc) {
      const [ordersRes, msgRes] = await Promise.all([
        db.from('orders').select('total, status').eq('restaurant_id', restaurantId)
          .gte('created_at', startUtc).lt('created_at', endUtc),
        db.from('message_logs').select('chat_id').eq('restaurant_id', restaurantId)
          .gte('created_at', startUtc).lt('created_at', endUtc),
      ])
      const orders = (ordersRes.data ?? []).filter((o) => o.status !== 'annulee')
      const revenue = orders.reduce((s, o) => s + (o.total as number), 0)
      const conversations = new Set((msgRes.data ?? []).map((m) => m.chat_id as string)).size
      return { orders: orders.length, revenue, conversations }
    },

    async saveReport({ restaurantId, period, headline, insights, model }) {
      const { error } = await db.from('analysis_reports').upsert(
        {
          restaurant_id: restaurantId,
          period_type: period.type,
          period_start: period.start,
          period_end: period.end,
          headline,
          ai_insights: insights,
          model,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'restaurant_id,period_type,period_start', ignoreDuplicates: true },
      )
      // Remonter l'échec : l'appelant marque ce (resto, période) comme échoué pour NE PAS rappeler
      // Mistral (déjà facturé) à chaque tick tant que l'écriture ne passe pas.
      if (error) throw new Error(`saveReport: ${error.message}`)
    },
  }
}
