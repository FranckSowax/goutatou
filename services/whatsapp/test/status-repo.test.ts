import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createStatusRepo, NOT_VALIDATED_IN_TIME_ERROR } from '../src/statuses/repo.js'

const TOKEN_KEY = '0'.repeat(64)

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (cf. catalog-repo.test.ts). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lte', 'in', 'update']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: finalData, error: null }).then(resolve)
  return chain
}

describe('createStatusRepo — cancelExpiredPendingApproval', () => {
  it('filtre pending_approval + mode manager + scheduled_at <= now, annule (canceled) avec l\'erreur FR', async () => {
    const readChain = makeChain([{ id: 's1' }, { id: 's2' }])
    const updateChain = makeChain(null)
    const from = vi.fn()
      .mockReturnValueOnce(readChain) // select des ids à annuler
      .mockReturnValueOnce(updateChain) // update canceled
    const repo = createStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.cancelExpiredPendingApproval('2026-07-13T12:00:00.000Z')

    expect(readChain.eq).toHaveBeenCalledWith('state', 'pending_approval')
    expect(readChain.eq).toHaveBeenCalledWith('restaurants.auto_status_validation', 'manager')
    expect(readChain.lte).toHaveBeenCalledWith('scheduled_at', '2026-07-13T12:00:00.000Z')
    expect(updateChain.update).toHaveBeenCalledWith({ state: 'canceled', error: NOT_VALIDATED_IN_TIME_ERROR })
    expect(updateChain.in).toHaveBeenCalledWith('id', ['s1', 's2'])
  })

  it('aucun statut expiré → pas d\'appel update', async () => {
    const readChain = makeChain([])
    const from = vi.fn().mockReturnValue(readChain)
    const repo = createStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.cancelExpiredPendingApproval('2026-07-13T12:00:00.000Z')

    expect(from).toHaveBeenCalledTimes(1) // uniquement la lecture, pas d'update
  })
})
