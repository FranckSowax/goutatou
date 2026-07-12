import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

export type PollTarget = 'channel' | 'optin'

export interface ClaimedPoll {
  id: string
  restaurantId: string
  question: string
  options: string[]
  quizCorrect: number | null
  target: PollTarget
}

export interface PollChannel { token: string; status: string; waChannelId: string | null }

export interface FinishResult {
  status: 'sent' | 'failed'
  sentCount: number
  error?: string | null
}

export interface PollRepo {
  claimQueued(): Promise<ClaimedPoll[]>
  getChannel(restaurantId: string): Promise<PollChannel | null>
  optInChatIds(restaurantId: string): Promise<string[]>
  finish(pollId: string, result: FinishResult): Promise<void>
}

interface PollQueueRow {
  id: string
  restaurant_id: string
  question: string
  options: string[]
  quiz_correct: number | null
  target: PollTarget
}

export function createPollRepo(db: SupabaseClient, tokenKey: string): PollRepo {
  return {
    async claimQueued() {
      // Le canal actif ne peut pas être exprimé dans une seule requête `update` (PostgREST ne
      // filtre pas un update par une ressource embarquée) : on lit d'abord les sondages 'queued'
      // dont le resto a un canal Whapi actif (jointure imbriquée polls -> restaurants ->
      // whapi_channels, pattern catalog/repo.ts claimSyncRequests), puis on claim par update
      // conditionnel sur les seuls ids retenus (guard `.eq('status','queued')` : ne consomme
      // que ce qui est encore en file au moment du claim).
      const { data } = await db
        .from('polls')
        .select('id, restaurant_id, question, options, quiz_correct, target, restaurants!inner(whapi_channels!inner(status))')
        .eq('status', 'queued')
        .eq('restaurants.whapi_channels.status', 'active')
      const rows = (data ?? []) as unknown as PollQueueRow[]
      const ids = rows.map((r) => r.id)
      if (ids.length === 0) return []

      const { data: claimed } = await db
        .from('polls')
        .update({ status: 'sending' })
        .in('id', ids)
        .eq('status', 'queued')
        .select('id, restaurant_id, question, options, quiz_correct, target')
      return ((claimed ?? []) as unknown as PollQueueRow[]).map((r) => ({
        id: r.id,
        restaurantId: r.restaurant_id,
        question: r.question,
        options: r.options,
        quizCorrect: r.quiz_correct,
        target: r.target,
      }))
    },

    async getChannel(restaurantId) {
      const { data } = await db
        .from('restaurants')
        .select('wa_channel_id, whapi_channels(token_encrypted, status)')
        .eq('id', restaurantId)
        .single()
      if (!data) return null
      const raw = data as unknown as {
        wa_channel_id: string | null
        whapi_channels: { token_encrypted: string; status: string } | { token_encrypted: string; status: string }[] | null
      }
      const wc = Array.isArray(raw.whapi_channels) ? raw.whapi_channels[0] : raw.whapi_channels
      if (!wc) return null
      return { token: decryptToken(wc.token_encrypted, tokenKey), status: wc.status, waChannelId: raw.wa_channel_id }
    },

    async optInChatIds(restaurantId) {
      const { data } = await db
        .from('customers')
        .select('chat_id')
        .eq('restaurant_id', restaurantId)
        .eq('marketing_opt_in', true)
        .eq('opted_out', false)
      return ((data ?? []) as { chat_id: string }[]).map((c) => c.chat_id)
    },

    async finish(pollId, result) {
      const { error: updErr } = await db
        .from('polls')
        .update({
          status: result.status,
          sent_count: result.sentCount,
          error: result.error ?? null,
          sent_at: result.status === 'sent' ? new Date().toISOString() : null,
        })
        .eq('id', pollId)
      if (updErr) throw new Error(`finish: ${updErr.message}`)
    },
  }
}
