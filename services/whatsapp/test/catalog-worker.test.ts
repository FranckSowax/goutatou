import { describe, expect, it, vi } from 'vitest'
import { syncRestaurantCatalog, type CatalogWorkerDeps } from '../src/catalog/worker.js'
import type { CatalogItem, CatalogRepo } from '../src/catalog/repo.js'

const RID = 'r1'

function item(over: Partial<CatalogItem> = {}): CatalogItem {
  return {
    id: 'item1', name: 'Poulet DG', price: 5000, description: 'Sauce maison',
    photoUrl: 'https://x/photo.jpg', waProductId: null, ...over,
  }
}

function makeDeps(over: Partial<CatalogWorkerDeps> = {}): {
  deps: CatalogWorkerDeps
  createProduct: ReturnType<typeof vi.fn>
  updateProduct: ReturnType<typeof vi.fn>
  deleteProduct: ReturnType<typeof vi.fn>
  getProducts: ReturnType<typeof vi.fn>
  repo: CatalogRepo
} {
  const createProduct = vi.fn().mockResolvedValue({ id: 'wa-new' })
  const updateProduct = vi.fn().mockResolvedValue(undefined)
  const deleteProduct = vi.fn().mockResolvedValue(undefined)
  const getProducts = vi.fn().mockResolvedValue([])
  const repo: CatalogRepo = {
    claimSyncRequests: vi.fn(),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    getSyncableItems: vi.fn().mockResolvedValue([item()]),
    setWaProductId: vi.fn().mockResolvedValue(undefined),
    clearWaProductId: vi.fn().mockResolvedValue(undefined),
    finishSync: vi.fn().mockResolvedValue(undefined),
  }
  const deps: CatalogWorkerDeps = {
    repo,
    makeWhapi: () => ({ createProduct, updateProduct, deleteProduct, getProducts }),
    sleep: vi.fn().mockResolvedValue(undefined),
    rng: () => 0,
    sendDelayMinMs: 4000,
    sendDelayMaxMs: 8000,
    ...over,
  }
  return { deps, createProduct, updateProduct, deleteProduct, getProducts, repo }
}

describe('syncRestaurantCatalog', () => {
  it('plat local sans produit distant → createProduct puis setWaProductId, throttlé', async () => {
    const { deps, createProduct, repo } = makeDeps()
    await syncRestaurantCatalog(RID, deps)
    expect(createProduct).toHaveBeenCalledWith({
      name: 'Poulet DG', price: 5000, currency: 'XAF', retailer_id: 'item1',
      description: 'Sauce maison', imageUrl: 'https://x/photo.jpg',
    })
    expect(repo.setWaProductId).toHaveBeenCalledWith('item1', 'wa-new')
    expect(deps.sleep).toHaveBeenCalled()
    expect(repo.finishSync).toHaveBeenCalledWith(RID, null)
  })

  it('plat local déjà présent côté Whapi (retailer_id connu) → updateProduct, pas de create', async () => {
    const { deps, createProduct, updateProduct, getProducts, repo } = makeDeps()
    repo.getSyncableItems = vi.fn().mockResolvedValue([item({ waProductId: 'wa-old' })])
    getProducts.mockResolvedValue([{ id: 'wa-old', retailer_id: 'item1' }])
    await syncRestaurantCatalog(RID, deps)
    expect(createProduct).not.toHaveBeenCalled()
    expect(updateProduct).toHaveBeenCalledWith('wa-old', {
      name: 'Poulet DG', price: 5000, currency: 'XAF', description: 'Sauce maison', imageUrl: 'https://x/photo.jpg',
    })
    expect(repo.finishSync).toHaveBeenCalledWith(RID, null)
  })

  it('produit distant orphelin (retailer_id sans plat local synchronisable) → deleteProduct + clearWaProductId', async () => {
    const { deps, getProducts, deleteProduct, repo } = makeDeps({})
    repo.getSyncableItems = vi.fn().mockResolvedValue([]) // aucun plat synchronisable ce tour
    getProducts.mockResolvedValue([{ id: 'wa-gone', retailer_id: 'item-disparu' }])
    await syncRestaurantCatalog(RID, deps)
    expect(deleteProduct).toHaveBeenCalledWith('wa-gone')
    expect(repo.clearWaProductId).toHaveBeenCalledWith('wa-gone')
    expect(repo.finishSync).toHaveBeenCalledWith(RID, null)
  })

  it('plat sans photo déjà exclu par le repo (getSyncableItems) → non traité ici', async () => {
    const { deps, createProduct, repo } = makeDeps()
    repo.getSyncableItems = vi.fn().mockResolvedValue([]) // le repo a filtré les plats sans photo
    await syncRestaurantCatalog(RID, deps)
    expect(createProduct).not.toHaveBeenCalled()
    expect(repo.finishSync).toHaveBeenCalledWith(RID, null)
  })

  it('throttle appelé entre chaque appel Whapi (create + orphelin)', async () => {
    const { deps, getProducts } = makeDeps()
    getProducts.mockResolvedValue([{ id: 'wa-gone', retailer_id: 'item-disparu' }])
    await syncRestaurantCatalog(RID, deps)
    // 1 create (item1) + 1 delete (orphelin) = 2 appels throttlés
    expect((deps.sleep as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2)
  })

  it('échec sur un produit → log + continue, finishSync avec message FR partiel', async () => {
    const { deps, createProduct, repo } = makeDeps()
    repo.getSyncableItems = vi.fn().mockResolvedValue([item({ id: 'a' }), item({ id: 'b', name: 'Poisson braisé' })])
    createProduct.mockRejectedValueOnce(new Error('whapi 400')).mockResolvedValueOnce({ id: 'wa-b' })
    await syncRestaurantCatalog(RID, deps)
    expect(createProduct).toHaveBeenCalledTimes(2)
    expect(repo.setWaProductId).toHaveBeenCalledWith('b', 'wa-b')
    expect(repo.finishSync).toHaveBeenCalledWith(RID, 'Synchronisation partielle : 1 produit(s) en erreur.')
  })

  it('échec global (getProducts) → finishSync avec message FR générique, aucun create/update/delete', async () => {
    const { deps, getProducts, createProduct, repo } = makeDeps()
    getProducts.mockRejectedValue(new Error('réseau'))
    await syncRestaurantCatalog(RID, deps)
    expect(createProduct).not.toHaveBeenCalled()
    expect(repo.finishSync).toHaveBeenCalledWith(RID, 'La synchronisation a échoué — vérifiez le canal WhatsApp.')
  })

  it('canal inactif → finishSync erreur FR, aucun appel Whapi', async () => {
    const { deps, createProduct, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 't', status: 'error' })
    await syncRestaurantCatalog(RID, deps)
    expect(createProduct).not.toHaveBeenCalled()
    expect(repo.finishSync).toHaveBeenCalledWith(RID, 'La synchronisation a échoué — vérifiez le canal WhatsApp.')
  })

  it('canal absent → finishSync erreur FR, aucun appel Whapi', async () => {
    const { deps, createProduct, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue(null)
    await syncRestaurantCatalog(RID, deps)
    expect(createProduct).not.toHaveBeenCalled()
    expect(repo.finishSync).toHaveBeenCalledWith(RID, 'La synchronisation a échoué — vérifiez le canal WhatsApp.')
  })
})
