import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptToken } from '@goutatou/db'
import { createDecisionRepo } from '../src/autostatus/decision-repo.js'

const TOKEN_KEY = '0'.repeat(64)

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (cf. catalog-repo.test.ts). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'lte', 'in', 'update', 'single']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: finalData, error: null }).then(resolve)
  return chain
}

describe('createDecisionRepo — listDueGroupBatches', () => {
  it('regroupe les lignes par approval_message_id (un sondage = un lot)', async () => {
    const chain = makeChain([
      { id: 's1', restaurant_id: 'r1', approval_message_id: 'poll-1' },
      { id: 's2', restaurant_id: 'r1', approval_message_id: 'poll-1' },
      { id: 's3', restaurant_id: 'r2', approval_message_id: 'poll-2' },
    ])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createDecisionRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const batches = await repo.listDueGroupBatches('2026-07-13T12:00:00.000Z')

    expect(batches).toEqual([
      { approvalMessageId: 'poll-1', restaurantId: 'r1', statusIds: ['s1', 's2'] },
      { approvalMessageId: 'poll-2', restaurantId: 'r2', statusIds: ['s3'] },
    ])
    expect(chain.eq).toHaveBeenCalledWith('state', 'pending_approval')
    expect(chain.eq).toHaveBeenCalledWith('auto_generated', true)
    expect(chain.eq).toHaveBeenCalledWith('restaurants.auto_status_validation', 'group')
    expect(chain.not).toHaveBeenCalledWith('approval_message_id', 'is', null)
    expect(chain.lte).toHaveBeenCalledWith('scheduled_at', '2026-07-13T12:00:00.000Z')
  })

  it('aucune ligne due → tableau vide', async () => {
    const chain = makeChain([])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createDecisionRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    expect(await repo.listDueGroupBatches('2026-07-13T12:00:00.000Z')).toEqual([])
  })
})

describe('createDecisionRepo — getChannel / approveBatch / cancelBatch', () => {
  it('getChannel déchiffre le token', async () => {
    const encrypted = encryptToken('tok-secret', TOKEN_KEY)
    const chain = makeChain({ token_encrypted: encrypted, status: 'active' })
    const from = vi.fn().mockReturnValue(chain)
    const repo = createDecisionRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    expect(await repo.getChannel('r1')).toEqual({ token: 'tok-secret', status: 'active' })
  })

  it('approveBatch passe les statuts en scheduled', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createDecisionRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.approveBatch(['s1', 's2'])

    expect(chain.update).toHaveBeenCalledWith({ state: 'scheduled' })
    expect(chain.in).toHaveBeenCalledWith('id', ['s1', 's2'])
  })

  it('cancelBatch passe les statuts en canceled avec l\'erreur', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createDecisionRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.cancelBatch(['s1'], 'Non validé par le groupe.')

    expect(chain.update).toHaveBeenCalledWith({ state: 'canceled', error: 'Non validé par le groupe.' })
    expect(chain.in).toHaveBeenCalledWith('id', ['s1'])
  })

  it('approveBatch/cancelBatch tableau vide → aucun appel', async () => {
    const from = vi.fn()
    const repo = createDecisionRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    await repo.approveBatch([])
    await repo.cancelBatch([], 'x')
    expect(from).not.toHaveBeenCalled()
  })
})
