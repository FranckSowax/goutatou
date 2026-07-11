import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptToken } from '@goutatou/db'

export interface DueReminder {
  id: string
  restaurantId: string
  chatId: string
  label: string
  expiresAt: string
}
export interface ReminderChannel { token: string; status: string }

export interface WheelReminderRepo {
  claimExpiringSpins(nowIso: string, windowDays?: number): Promise<DueReminder[]>
  getChannel(restaurantId: string): Promise<ReminderChannel | null>
}

interface ClaimedSpinRow {
  id: string
  restaurant_id: string
  customer_id: string
  prize_id: string | null
  expires_at: string
}

export function createWheelReminderRepo(db: SupabaseClient, tokenKey: string): WheelReminderRepo {
  return {
    async claimExpiringSpins(nowIso, windowDays = 3) {
      const windowEnd = new Date(new Date(nowIso).getTime() + windowDays * 24 * 3600 * 1000).toISOString()
      // Claim d'abord (reminded_at = now()) : au moins une fois côté DB, envoi WhatsApp best-effort
      // ensuite (pattern claimDue des workers statuts/campagnes) — au pire un rappel non envoyé
      // (échec réseau après le claim) n'est jamais relancé, acceptable pour ce best-effort.
      const { data } = await db
        .from('wheel_spins')
        .update({ reminded_at: nowIso })
        .eq('outcome', 'prize')
        .is('redeemed_at', null)
        .is('reminded_at', null)
        .gte('expires_at', nowIso)
        .lte('expires_at', windowEnd)
        .select('id, restaurant_id, customer_id, prize_id, expires_at')
      const claimed = (data ?? []) as ClaimedSpinRow[]
      if (claimed.length === 0) return []

      const customerIds = [...new Set(claimed.map((c) => c.customer_id))]
      const prizeIds = [...new Set(claimed.map((c) => c.prize_id).filter((id): id is string => Boolean(id)))]
      const [{ data: customers }, { data: prizes }] = await Promise.all([
        db.from('customers').select('id, chat_id, opted_out').in('id', customerIds),
        prizeIds.length
          ? db.from('prizes').select('id, label').in('id', prizeIds)
          : Promise.resolve({ data: [] as Array<{ id: string; label: string }> }),
      ])
      const customerMap = new Map((customers ?? []).map((c) => [c.id, c as { id: string; chat_id: string; opted_out: boolean }]))
      const prizeMap = new Map((prizes ?? []).map((p) => [p.id, p as { id: string; label: string }]))

      const out: DueReminder[] = []
      for (const row of claimed) {
        const customer = customerMap.get(row.customer_id)
        if (!customer || customer.opted_out) continue // opt-out respecté
        const prize = row.prize_id ? prizeMap.get(row.prize_id) : undefined
        out.push({
          id: row.id,
          restaurantId: row.restaurant_id,
          chatId: customer.chat_id,
          label: prize?.label ?? 'votre lot',
          expiresAt: row.expires_at,
        })
      }
      return out
    },
    async getChannel(restaurantId) {
      const { data } = await db.from('whapi_channels').select('token_encrypted, status')
        .eq('restaurant_id', restaurantId).single()
      if (!data) return null
      return { token: decryptToken(data.token_encrypted, tokenKey), status: data.status }
    },
  }
}
