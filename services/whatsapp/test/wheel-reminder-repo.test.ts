import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createWheelReminderRepo } from '../src/wheel/repo.js'

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (supabase-js). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['update', 'eq', 'is', 'gte', 'lte', 'in', 'select']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { data: unknown }) => unknown) => Promise.resolve({ data: finalData }).then(resolve)
  return chain
}

describe('createWheelReminderRepo — claimExpiringSpins', () => {
  it('claim les gains prize non redeemed/non rappelés expirant sous 3j, exclut les clients opted_out', async () => {
    const wheelSpinsChain = makeChain([
      { id: 'ws1', restaurant_id: 'r1', customer_id: 'c1', prize_id: 'p1', expires_at: '2026-07-13T00:00:00.000Z' },
      { id: 'ws2', restaurant_id: 'r1', customer_id: 'c2', prize_id: 'p2', expires_at: '2026-07-14T00:00:00.000Z' },
    ])
    const customersChain = makeChain([
      { id: 'c1', chat_id: '24177000001@s.whatsapp.net', opted_out: false },
      { id: 'c2', chat_id: '24177000002@s.whatsapp.net', opted_out: true }, // exclu
    ])
    const prizesChain = makeChain([
      { id: 'p1', label: 'Café offert' },
      { id: 'p2', label: 'Dessert offert' },
    ])
    const from = vi.fn((table: string) => {
      if (table === 'wheel_spins') return wheelSpinsChain
      if (table === 'customers') return customersChain
      if (table === 'prizes') return prizesChain
      throw new Error(`table inattendue : ${table}`)
    })
    const repo = createWheelReminderRepo({ from } as unknown as SupabaseClient, 'k'.repeat(32))

    const due = await repo.claimExpiringSpins('2026-07-11T00:00:00.000Z', 3)

    expect(due).toHaveLength(1)
    expect(due[0]).toEqual({
      id: 'ws1', restaurantId: 'r1', chatId: '24177000001@s.whatsapp.net', label: 'Café offert', expiresAt: '2026-07-13T00:00:00.000Z',
    })
    // Le claim (update reminded_at) filtre bien outcome=prize, redeemed_at/reminded_at null, fenêtre expires_at.
    expect(wheelSpinsChain.update).toHaveBeenCalledWith({ reminded_at: '2026-07-11T00:00:00.000Z' })
    expect(wheelSpinsChain.eq).toHaveBeenCalledWith('outcome', 'prize')
    expect(wheelSpinsChain.is).toHaveBeenCalledWith('redeemed_at', null)
    expect(wheelSpinsChain.is).toHaveBeenCalledWith('reminded_at', null)
  })

  it('aucun gain claim → tableau vide, pas de requête customers/prizes', async () => {
    const wheelSpinsChain = makeChain([])
    const from = vi.fn((table: string) => {
      if (table === 'wheel_spins') return wheelSpinsChain
      throw new Error(`table inattendue : ${table}`)
    })
    const repo = createWheelReminderRepo({ from } as unknown as SupabaseClient, 'k'.repeat(32))
    const due = await repo.claimExpiringSpins('2026-07-11T00:00:00.000Z')
    expect(due).toEqual([])
  })
})
