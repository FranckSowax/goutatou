import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createArrivalRepo } from '../src/drive/arrival-repo.js'

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (cf. approval-repo.test.ts). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'update', 'not', 'order', 'limit']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve({ data: finalData, error: null }))
  chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: finalData, error: null }).then(resolve)
  return chain
}

describe('createArrivalRepo — getOrder', () => {
  it('filtre id + restaurant_id, mappe les colonnes', async () => {
    const chain = makeChain({ id: 'o1', restaurant_id: 'r1', mode: 'drive', status: 'prete' })
    const from = vi.fn().mockReturnValue(chain)
    const repo = createArrivalRepo({ from } as unknown as SupabaseClient)

    const order = await repo.getOrder('o1', 'r1')

    expect(order).toEqual({ id: 'o1', restaurantId: 'r1', mode: 'drive', status: 'prete' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'o1')
    expect(chain.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
  })

  it('aucune ligne (id inconnu ou autre restaurant) → null', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createArrivalRepo({ from } as unknown as SupabaseClient)

    expect(await repo.getOrder('o1', 'r1')).toBeNull()
  })
})

describe('createArrivalRepo — markArrived', () => {
  it('1er appel : arrived_at était null → une ligne mise à jour → true', async () => {
    const chain = makeChain([{ id: 'o1' }])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createArrivalRepo({ from } as unknown as SupabaseClient)

    const ok = await repo.markArrived('o1')

    expect(ok).toBe(true)
    expect(chain.update).toHaveBeenCalledWith({ arrived_at: expect.any(String) })
    expect(chain.eq).toHaveBeenCalledWith('id', 'o1')
    expect(chain.is).toHaveBeenCalledWith('arrived_at', null)
  })

  it('2e appel (déjà arrivé, double-tap) : condition arrived_at is null ne matche plus → 0 ligne → false', async () => {
    const chain = makeChain([])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createArrivalRepo({ from } as unknown as SupabaseClient)

    expect(await repo.markArrived('o1')).toBe(false)
  })
})

describe('createArrivalRepo — findPendingDriveOrder', () => {
  it('une commande drive en attente → filtre restaurant/client/mode/arrivée/statut, trie par plus récente, limite à 1', async () => {
    const chain = makeChain([{ id: 'o1' }])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createArrivalRepo({ from } as unknown as SupabaseClient)

    const order = await repo.findPendingDriveOrder('r1', 'c1')

    expect(order).toEqual({ id: 'o1' })
    expect(chain.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
    expect(chain.eq).toHaveBeenCalledWith('customer_id', 'c1')
    expect(chain.eq).toHaveBeenCalledWith('mode', 'drive')
    expect(chain.is).toHaveBeenCalledWith('arrived_at', null)
    expect(chain.not).toHaveBeenCalledWith('status', 'in', '(recuperee,annulee)')
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(1)
  })

  it('aucune commande en attente → null', async () => {
    const chain = makeChain([])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createArrivalRepo({ from } as unknown as SupabaseClient)

    expect(await repo.findPendingDriveOrder('r1', 'c1')).toBeNull()
  })
})
