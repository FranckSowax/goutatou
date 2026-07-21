import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createRepo } from '../src/repo.js'

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (cf. arrival-repo.test.ts). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: finalData, error: null }).then(resolve)
  return chain
}

describe('createRepo — getActiveOrder', () => {
  it('filtre resto + client + statuts terminés, trie par plus récente, limite à 1', async () => {
    const chain = makeChain([{ order_number: 42, status: 'en_preparation', mode: 'drive', total: 9000 }])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createRepo({ from } as unknown as SupabaseClient, 'key')

    const order = await repo.getActiveOrder!('r1', 'c1')

    expect(order).toEqual({ orderNumber: 42, status: 'en_preparation', mode: 'drive', total: 9000 })
    expect(from).toHaveBeenCalledWith('orders')
    expect(chain.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
    expect(chain.eq).toHaveBeenCalledWith('customer_id', 'c1')
    expect(chain.not).toHaveBeenCalledWith('status', 'in', '(recuperee,annulee)')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(1)
  })

  it('aucune commande active → null', async () => {
    const chain = makeChain([])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createRepo({ from } as unknown as SupabaseClient, 'key')

    expect(await repo.getActiveOrder!('r1', 'c1')).toBeNull()
  })

  it('data null (erreur silencieuse Supabase) → null, jamais de crash', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createRepo({ from } as unknown as SupabaseClient, 'key')

    expect(await repo.getActiveOrder!('r1', 'c1')).toBeNull()
  })
})
