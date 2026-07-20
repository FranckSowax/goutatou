import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createCampaignRepo } from '../src/campaigns/repo.js'

const TOKEN_KEY = '0'.repeat(64)

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (cf. status-repo.test.ts). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'lte', 'lt', 'in', 'update']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: finalData, error: null }).then(resolve)
  return chain
}

const NOW = '2026-07-20T12:00:00.000Z'

describe('createCampaignRepo — claimScheduledDue (claim atomique, audit lot B correctif 2)', () => {
  it('ne renvoie que les campagnes que CE process a fait basculer scheduled → sending', async () => {
    const claimChain = makeChain([
      { id: 'c1', restaurant_id: 'r1', body: 'Promo', media_url: null },
    ])
    const resumeChain = makeChain([])
    const from = vi.fn().mockReturnValueOnce(claimChain).mockReturnValueOnce(resumeChain)
    const repo = createCampaignRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const due = await repo.claimScheduledDue(NOW)

    expect(due).toEqual([{ id: 'c1', restaurantId: 'r1', body: 'Promo', mediaUrl: null }])
    // Claim = update conditionnel + select : jamais un select global de tout ce qui est 'sending'.
    expect(claimChain.update).toHaveBeenCalledWith({ status: 'sending', started_at: NOW })
    expect(claimChain.eq).toHaveBeenCalledWith('status', 'scheduled')
    expect(claimChain.lte).toHaveBeenCalledWith('scheduled_at', NOW)
    expect(claimChain.select).toHaveBeenCalled()
  })

  it('une campagne déjà prise par une autre instance (update non gagné) n\'est pas renvoyée', async () => {
    const claimChain = makeChain([]) // l'autre instance a gagné l'update
    const resumeChain = makeChain([]) // bail non expiré → pas de reprise
    const from = vi.fn().mockReturnValueOnce(claimChain).mockReturnValueOnce(resumeChain)
    const repo = createCampaignRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    expect(await repo.claimScheduledDue(NOW)).toEqual([])
  })

  it('reprend une campagne "sending" orpheline via un re-claim conditionnel sur un bail expiré', async () => {
    const claimChain = makeChain([])
    const resumeChain = makeChain([
      { id: 'c2', restaurant_id: 'r2', body: 'Reprise', media_url: 'https://x.test/p.jpg' },
    ])
    const from = vi.fn().mockReturnValueOnce(claimChain).mockReturnValueOnce(resumeChain)
    const repo = createCampaignRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const due = await repo.claimScheduledDue(NOW)

    expect(due).toEqual([{ id: 'c2', restaurantId: 'r2', body: 'Reprise', mediaUrl: 'https://x.test/p.jpg' }])
    expect(resumeChain.update).toHaveBeenCalledWith({ started_at: NOW })
    expect(resumeChain.eq).toHaveBeenCalledWith('status', 'sending')
    // Bail de 10 min : seules les campagnes dont le claim est plus vieux que la coupure.
    expect(resumeChain.lt).toHaveBeenCalledWith('started_at', '2026-07-20T11:50:00.000Z')
    expect(resumeChain.select).toHaveBeenCalled()
  })

  it('concatène claims neufs et reprises', async () => {
    const claimChain = makeChain([{ id: 'c1', restaurant_id: 'r1', body: 'A', media_url: null }])
    const resumeChain = makeChain([{ id: 'c2', restaurant_id: 'r2', body: 'B', media_url: null }])
    const from = vi.fn().mockReturnValueOnce(claimChain).mockReturnValueOnce(resumeChain)
    const repo = createCampaignRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    expect((await repo.claimScheduledDue(NOW)).map((c) => c.id)).toEqual(['c1', 'c2'])
  })
})
