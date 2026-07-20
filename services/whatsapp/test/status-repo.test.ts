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

describe('createStatusRepo — claimDue (claim atomique at-most-once, audit lot B correctif 2)', () => {
  it('claim par update conditionnel scheduled → posting, ne renvoie que les lignes gagnées', async () => {
    const chain = makeChain([
      {
        id: 's1', restaurant_id: 'r1', kind: 'text', content: 'Bonjour', media_url: null,
        bg_color: null, caption_color: null, font_type: null, audience: 'all',
        echo_to_channel: false, restaurants: { wa_channel_id: 'chan-1' },
      },
    ])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const due = await repo.claimDue('2026-07-20T12:00:00.000Z')

    expect(due).toEqual([
      {
        id: 's1', restaurantId: 'r1', kind: 'text', content: 'Bonjour', mediaUrl: null,
        bgColor: null, captionColor: null, fontType: null, audience: 'all',
        echoToChannel: false, waChannelId: 'chan-1',
      },
    ])
    // Une SEULE requête : update conditionnel + select — plus de second select global sur 'posting'.
    expect(from).toHaveBeenCalledTimes(1)
    expect(chain.update).toHaveBeenCalledWith({ state: 'posting' })
    expect(chain.eq).toHaveBeenCalledWith('state', 'scheduled')
    expect(chain.lte).toHaveBeenCalledWith('scheduled_at', '2026-07-20T12:00:00.000Z')
    expect(chain.eq).not.toHaveBeenCalledWith('state', 'posting')
  })

  it("une ligne 'posting' orpheline (markPosted en échec) n'est jamais reprise → plus de boucle de reposts", async () => {
    // Le claim ne fait basculer que des 'scheduled' : la ligne restée en 'posting' n'est pas
    // renvoyée par l'update, donc jamais republiée au tick suivant.
    const chain = makeChain([])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    expect(await repo.claimDue('2026-07-20T12:00:00.000Z')).toEqual([])
  })
})
