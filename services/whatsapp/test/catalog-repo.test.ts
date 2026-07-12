import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { encryptToken } from '@goutatou/db'
import { createCatalogRepo } from '../src/catalog/repo.js'

const TOKEN_KEY = '0'.repeat(64)

/** Chaînable minimal reproduisant le style thenable de PostgrestFilterBuilder (supabase-js). */
function makeChain(finalData: unknown) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'not', 'in', 'update', 'order', 'single']) {
    chain[m] = vi.fn(() => chain)
  }
  chain.then = (resolve: (v: { data: unknown }) => unknown) => Promise.resolve({ data: finalData }).then(resolve)
  return chain
}

describe('createCatalogRepo — claimSyncRequests', () => {
  it('claim seulement les restos dus (requested_at non null et (synced_at null ou requested_at > synced_at)), canal actif filtré en requête', async () => {
    const selectChain = makeChain([
      { id: 'r-due-1', catalog_sync_requested_at: '2026-07-12T10:00:00Z', catalog_synced_at: null, whapi_channels: { status: 'active' } },
      { id: 'r-due-2', catalog_sync_requested_at: '2026-07-12T10:00:00Z', catalog_synced_at: '2026-07-12T09:00:00Z', whapi_channels: { status: 'active' } },
      { id: 'r-not-due', catalog_sync_requested_at: '2026-07-12T08:00:00Z', catalog_synced_at: '2026-07-12T09:00:00Z', whapi_channels: { status: 'active' } },
    ])
    const updateChain = makeChain([{ id: 'r-due-1' }, { id: 'r-due-2' }])
    const from = vi.fn().mockReturnValueOnce(selectChain).mockReturnValueOnce(updateChain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const due = await repo.claimSyncRequests()

    expect(due).toEqual([{ restaurantId: 'r-due-1' }, { restaurantId: 'r-due-2' }])
    // Requête de lecture : catalog_enabled, requested_at non null, canal actif (join whapi_channels!inner).
    expect(selectChain.select).toHaveBeenCalledWith(
      expect.stringContaining('whapi_channels!inner(status)'),
    )
    expect(selectChain.eq).toHaveBeenCalledWith('catalog_enabled', true)
    expect(selectChain.eq).toHaveBeenCalledWith('whapi_channels.status', 'active')
    expect(selectChain.not).toHaveBeenCalledWith('catalog_sync_requested_at', 'is', null)
    // Claim : seuls les 2 restos dus (r-not-due exclu car requested_at <= synced_at).
    expect(updateChain.update).toHaveBeenCalledWith({ catalog_sync_requested_at: null })
    expect(updateChain.in).toHaveBeenCalledWith('id', ['r-due-1', 'r-due-2'])
  })

  it('aucun resto dû → tableau vide, pas de requête de claim (update)', async () => {
    const selectChain = makeChain([])
    const from = vi.fn().mockReturnValueOnce(selectChain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const due = await repo.claimSyncRequests()

    expect(due).toEqual([])
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('resto avec canal non actif exclu par la requête (whapi_channels.status=active demandé côté PostgREST)', async () => {
    // Le join !inner + .eq('whapi_channels.status','active') filtre côté base ; ce test
    // vérifie que le repo construit bien cette requête (le fake ne simule pas PostgREST,
    // donc on n'y met que des restos déjà "actifs" et on prouve le filtre demandé).
    const selectChain = makeChain([])
    const from = vi.fn().mockReturnValueOnce(selectChain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    await repo.claimSyncRequests()
    expect(selectChain.eq).toHaveBeenCalledWith('whapi_channels.status', 'active')
  })
})

describe('createCatalogRepo — getSyncableItems', () => {
  it('ne retient que les plats disponibles avec photo, triés par position catégorie puis plat', async () => {
    const chain = makeChain([
      {
        position: 1,
        menu_items: [
          { id: 'b', name: 'Poisson', price: 6000, description: null, photo_url: 'https://x/b.jpg', wa_product_id: null, available: true, position: 1 },
          { id: 'a', name: 'Poulet', price: 5000, description: 'desc', photo_url: 'https://x/a.jpg', wa_product_id: 'wa-a', available: true, position: 0 },
          { id: 'c', name: 'Sans photo', price: 1000, description: null, photo_url: null, wa_product_id: null, available: true, position: 2 },
          { id: 'd', name: 'Indispo', price: 1000, description: null, photo_url: 'https://x/d.jpg', wa_product_id: null, available: false, position: 3 },
        ],
      },
    ])
    const from = vi.fn().mockReturnValue(chain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)

    const items = await repo.getSyncableItems('r1')

    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(items[0]).toEqual({
      id: 'a', name: 'Poulet', price: 5000, description: 'desc', photoUrl: 'https://x/a.jpg', waProductId: 'wa-a',
    })
  })
})

describe('createCatalogRepo — setWaProductId / clearWaProductId / finishSync / getChannel', () => {
  it('setWaProductId met à jour menu_items par id', async () => {
    const chain = makeChain(null)
    chain.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    await repo.setWaProductId('item1', 'wa-1')
    expect(chain.update).toHaveBeenCalledWith({ wa_product_id: 'wa-1' })
    expect(chain.eq).toHaveBeenCalledWith('id', 'item1')
  })

  it('clearWaProductId met à jour menu_items par wa_product_id', async () => {
    const chain = makeChain(null)
    chain.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    await repo.clearWaProductId('wa-gone')
    expect(chain.update).toHaveBeenCalledWith({ wa_product_id: null })
    expect(chain.eq).toHaveBeenCalledWith('wa_product_id', 'wa-gone')
  })

  it('finishSync écrit catalog_synced_at + catalog_sync_error', async () => {
    const chain = makeChain(null)
    chain.then = (resolve: (v: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    await repo.finishSync('r1', 'Synchronisation partielle : 1 produit(s) en erreur.')
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({
      catalog_sync_error: 'Synchronisation partielle : 1 produit(s) en erreur.',
    }))
    expect(chain.eq).toHaveBeenCalledWith('id', 'r1')
  })

  it('getChannel déchiffre le token et renvoie le statut', async () => {
    const encrypted = encryptToken('tok-secret', TOKEN_KEY)
    const chain = makeChain({ token_encrypted: encrypted, status: 'active' })
    const from = vi.fn().mockReturnValue(chain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    const channel = await repo.getChannel('r1')
    expect(channel).toEqual({ token: 'tok-secret', status: 'active' })
  })

  it('getChannel renvoie null si aucun canal', async () => {
    const chain = makeChain(null)
    const from = vi.fn().mockReturnValue(chain)
    const repo = createCatalogRepo({ from } as unknown as SupabaseClient, TOKEN_KEY)
    const channel = await repo.getChannel('r1')
    expect(channel).toBeNull()
  })
})
