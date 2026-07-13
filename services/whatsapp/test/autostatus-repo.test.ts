import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptToken } from '@goutatou/db'
import { createAutoStatusRepo } from '../src/autostatus/repo.js'

const TOKEN_KEY = '0'.repeat(64)

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (cf. catalog-repo.test.ts). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'is', 'not', 'in', 'order', 'update', 'insert', 'single']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
    Promise.resolve({ data: finalData, error: null }).then(resolve)
  return chain
}

describe('createAutoStatusRepo — listCandidates', () => {
  it('filtre auto_status_enabled + premium actif + canal actif, mappe les colonnes (dont validation)', async () => {
    const chain = makeChain([
      {
        id: 'r1', auto_status_times: ['11:30', '18:30'], auto_status_count: 2,
        auto_status_cursor: 1, auto_status_last_slot: '2026-07-12 11:30',
        auto_status_validation: 'manager', auto_status_manager_phone: '24177000001@s.whatsapp.net',
        contact_phone: '24177000009@s.whatsapp.net', staff_group_id: null,
      },
    ])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const candidates = await repo.listCandidates()

    expect(candidates).toEqual([{
      restaurantId: 'r1', autoStatusTimes: ['11:30', '18:30'], autoStatusCount: 2,
      autoStatusCursor: 1, autoStatusLastSlot: '2026-07-12 11:30',
      autoStatusValidation: 'manager', autoStatusManagerPhone: '24177000001@s.whatsapp.net',
      contactPhone: '24177000009@s.whatsapp.net', staffGroupId: null,
    }])
    expect(chain.eq).toHaveBeenCalledWith('auto_status_enabled', true)
    expect(chain.eq).toHaveBeenCalledWith('subscriptions.plan', 'premium')
    expect(chain.eq).toHaveBeenCalledWith('subscriptions.status', 'active')
    expect(chain.eq).toHaveBeenCalledWith('whapi_channels.status', 'active')
  })

  it('aucun resto éligible → tableau vide', async () => {
    const chain = makeChain([])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    expect(await repo.listCandidates()).toEqual([])
  })
})

describe('createAutoStatusRepo — claimSlot', () => {
  it('previousLastSlot null → filtre .is(auto_status_last_slot, null), succès si ligne retournée', async () => {
    const chain = makeChain([{ id: 'r1' }])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const ok = await repo.claimSlot('r1', '2026-07-13 11:30', null)

    expect(ok).toBe(true)
    expect(chain.update).toHaveBeenCalledWith({ auto_status_last_slot: '2026-07-13 11:30' })
    expect(chain.is).toHaveBeenCalledWith('auto_status_last_slot', null)
  })

  it('previousLastSlot non-null → filtre .eq(auto_status_last_slot, previous)', async () => {
    const chain = makeChain([{ id: 'r1' }])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.claimSlot('r1', '2026-07-13 11:30', '2026-07-12 11:30')

    expect(chain.eq).toHaveBeenCalledWith('auto_status_last_slot', '2026-07-12 11:30')
  })

  it('aucune ligne mise à jour (créneau déjà pris) → false', async () => {
    const chain = makeChain([])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    expect(await repo.claimSlot('r1', '2026-07-13 11:30', null)).toBe(false)
  })
})

describe('createAutoStatusRepo — getPhotoDishes', () => {
  it('ne retient que les plats disponibles avec photo, triés par position catégorie puis plat', async () => {
    const chain = makeChain([
      {
        position: 1,
        menu_items: [
          { id: 'b', name: 'Poisson', price: 6000, photo_url: 'https://x/b.jpg', available: true, position: 1 },
          { id: 'a', name: 'Poulet', price: 5000, photo_url: 'https://x/a.jpg', available: true, position: 0 },
          { id: 'c', name: 'Sans photo', price: 1000, photo_url: null, available: true, position: 2 },
          { id: 'd', name: 'Indispo', price: 1000, photo_url: 'https://x/d.jpg', available: false, position: 3 },
        ],
      },
    ])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const dishes = await repo.getPhotoDishes('r1')

    expect(dishes.map((d) => d.id)).toEqual(['a', 'b'])
    expect(dishes[0]).toEqual({ id: 'a', name: 'Poulet', price: 5000, photoUrl: 'https://x/a.jpg' })
  })
})

describe('createAutoStatusRepo — bumpCursor / insertGeneratedStatuses', () => {
  it('bumpCursor met à jour auto_status_cursor', async () => {
    const chain = makeChain(null)
    chain.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.bumpCursor('r1', 3)

    expect(chain.update).toHaveBeenCalledWith({ auto_status_cursor: 3 })
    expect(chain.eq).toHaveBeenCalledWith('id', 'r1')
  })

  it('insertGeneratedStatuses insère kind image, state scheduled, audience all, auto_generated true', async () => {
    const chain = makeChain(null)
    chain.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.insertGeneratedStatuses([
      { restaurantId: 'r1', content: 'Légende', mediaUrl: 'https://x/a.jpg', scheduledAt: '2026-07-13T10:35:00.000Z' },
    ])

    expect(chain.insert).toHaveBeenCalledWith([{
      restaurant_id: 'r1', kind: 'image', content: 'Légende', media_url: 'https://x/a.jpg',
      scheduled_at: '2026-07-13T10:35:00.000Z', state: 'scheduled', audience: 'all', auto_generated: true,
    }])
  })

  it('insertGeneratedStatuses ne fait aucun appel si le tableau est vide', async () => {
    const from = vi.fn()
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    await repo.insertGeneratedStatuses([])
    expect(from).not.toHaveBeenCalled()
  })
})

describe('createAutoStatusRepo — insertPendingApprovalStatuses', () => {
  it('insère state pending_approval, auto_generated true, renvoie id/content/mediaUrl', async () => {
    const chain = makeChain([{ id: 's1', content: 'Légende', media_url: 'https://x/a.jpg' }])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const refs = await repo.insertPendingApprovalStatuses([
      { restaurantId: 'r1', content: 'Légende', mediaUrl: 'https://x/a.jpg', scheduledAt: '2026-07-13T10:30:00.000Z' },
    ])

    expect(chain.insert).toHaveBeenCalledWith([{
      restaurant_id: 'r1', kind: 'image', content: 'Légende', media_url: 'https://x/a.jpg',
      scheduled_at: '2026-07-13T10:30:00.000Z', state: 'pending_approval', audience: 'all', auto_generated: true,
    }])
    expect(refs).toEqual([{ id: 's1', content: 'Légende', mediaUrl: 'https://x/a.jpg' }])
  })

  it('tableau vide → aucun appel, renvoie []', async () => {
    const from = vi.fn()
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    expect(await repo.insertPendingApprovalStatuses([])).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })
})

describe('createAutoStatusRepo — getChannel', () => {
  it('déchiffre le token du canal actif', async () => {
    const encrypted = encryptToken('tok-secret', TOKEN_KEY)
    const chain = makeChain({ token_encrypted: encrypted, status: 'active' })
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const channel = await repo.getChannel('r1')

    expect(channel).toEqual({ token: 'tok-secret', status: 'active' })
    expect(chain.eq).toHaveBeenCalledWith('restaurant_id', 'r1')
  })

  it('aucun canal → null', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    expect(await repo.getChannel('r1')).toBeNull()
  })
})

describe('createAutoStatusRepo — markFailed / markApprovalRequested', () => {
  it('markFailed passe le statut en failed avec le message', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.markFailed('s1', 'Renseignez le numéro du gérant validateur.')

    expect(chain.update).toHaveBeenCalledWith({ state: 'failed', error: 'Renseignez le numéro du gérant validateur.' })
    expect(chain.eq).toHaveBeenCalledWith('id', 's1')
  })

  it('markApprovalRequested met à jour approval_message_id + approval_requested_at pour tous les ids', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    await repo.markApprovalRequested(['s1', 's2'], 'msg-1', '2026-07-13T09:30:00.000Z')

    expect(chain.update).toHaveBeenCalledWith({ approval_message_id: 'msg-1', approval_requested_at: '2026-07-13T09:30:00.000Z' })
    expect(chain.in).toHaveBeenCalledWith('id', ['s1', 's2'])
  })

  it('markApprovalRequested tableau vide → aucun appel', async () => {
    const from = vi.fn()
    const repo = createAutoStatusRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    await repo.markApprovalRequested([], 'msg-1', '2026-07-13T09:30:00.000Z')
    expect(from).not.toHaveBeenCalled()
  })
})
