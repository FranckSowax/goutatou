import type { WhapiClient } from '@goutatou/whapi'
import { nextSendDelayMs } from '../campaigns/throttle.js'
import type { CatalogItem, CatalogRepo } from './repo.js'

export interface CatalogWorkerDeps {
  repo: CatalogRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'getProducts' | 'createProduct' | 'updateProduct' | 'deleteProduct'>
  sleep: (ms: number) => Promise<void>
  rng?: () => number
  sendDelayMinMs: number
  sendDelayMaxMs: number
}

const CURRENCY = 'XAF'
const GLOBAL_ERROR = 'La synchronisation a échoué — vérifiez le canal WhatsApp.'

type RemoteProduct = { id?: string; retailer_id?: string; name?: string; price?: number }

export async function syncRestaurantCatalog(restaurantId: string, deps: CatalogWorkerDeps): Promise<void> {
  const channel = await deps.repo.getChannel(restaurantId)
  if (!channel || channel.status !== 'active') {
    await deps.repo.finishSync(restaurantId, GLOBAL_ERROR)
    return
  }
  const whapi = deps.makeWhapi(channel.token)

  let items: CatalogItem[]
  let allItemIds: Set<string>
  let remote: RemoteProduct[]
  try {
    items = await deps.repo.getSyncableItems(restaurantId)
    allItemIds = await deps.repo.getAllItemIds(restaurantId)
    remote = await whapi.getProducts()
  } catch (err) {
    console.error('[catalog-sync]', err)
    await deps.repo.finishSync(restaurantId, GLOBAL_ERROR)
    return
  }

  const remoteByRetailerId = new Map(
    remote.filter((p): p is RemoteProduct & { retailer_id: string } => !!p.retailer_id).map((p) => [p.retailer_id, p]),
  )
  const localIds = new Set(items.map((i) => i.id))
  const throttle = () => deps.sleep(nextSendDelayMs(deps.sendDelayMinMs, deps.sendDelayMaxMs, deps.rng))
  let failures = 0

  for (const item of items) {
    const existing = remoteByRetailerId.get(item.id)
    try {
      if (!existing) {
        const res = await whapi.createProduct({
          name: item.name,
          price: item.price,
          currency: CURRENCY,
          retailer_id: item.id,
          description: item.description ?? '',
          imageUrl: item.photoUrl,
        })
        if (res.id) await deps.repo.setWaProductId(item.id, res.id)
      } else if (existing.id) {
        // v1 simple : update systématique (pas de diff name/price/description/image) — le
        // plan l'autorise explicitement, et Whapi exige de toute façon `images` complet à
        // chaque PATCH (pas de merge côté serveur, cf. client.ts updateProduct).
        await whapi.updateProduct(existing.id, {
          name: item.name,
          price: item.price,
          currency: CURRENCY,
          description: item.description ?? '',
          imageUrl: item.photoUrl,
        })
        if (existing.id !== item.waProductId) await deps.repo.setWaProductId(item.id, existing.id)
      }
    } catch (err) {
      console.error('[catalog-sync]', err)
      failures++
    }
    await throttle()
  }

  // Suppression STRICTEMENT limitée à notre périmètre : uniquement les produits dont le
  // retailer_id est un plat de CE restaurant (disponible ou non). Les produits créés à la
  // main par le restaurateur dans WhatsApp Business (retailer_id inconnu de Goutatou) ne
  // sont JAMAIS touchés. Garde pagination : si la page Whapi est pleine (100), on saute
  // toute la phase de suppression — un produit hors page passerait pour orphelin.
  if (remote.length >= 100) {
    console.error('[catalog-sync] page produits pleine — phase de suppression sautée par prudence')
  }
  for (const product of remote.length >= 100 ? [] : remote) {
    if (!product.retailer_id || !product.id) continue
    if (localIds.has(product.retailer_id)) continue
    if (!allItemIds.has(product.retailer_id)) continue
    try {
      await whapi.deleteProduct(product.id)
      // Le plat a pu devenir indisponible / perdre sa photo : on efface la référence locale
      // pour qu'un prochain sync le recrée proprement s'il redevient synchronisable.
      await deps.repo.clearWaProductId(product.id)
    } catch (err) {
      console.error('[catalog-sync]', err)
      failures++
    }
    await throttle()
  }

  await deps.repo.finishSync(
    restaurantId,
    failures > 0 ? `Synchronisation partielle : ${failures} produit(s) en erreur.` : null,
  )
}

export function startCatalogWorker(deps: CatalogWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      const due = await deps.repo.claimSyncRequests()
      for (const r of due) {
        // Isolation par restaurant (audit lot B — correctif 3) : un throw sur une sync ne doit
        // pas abandonner les restaurants suivants du même tick.
        try {
          await syncRestaurantCatalog(r.restaurantId, deps)
        } catch (err) {
          console.error('[catalog-sync] restaurant', r.restaurantId, err)
        }
      }
    } catch (err) {
      console.error('[catalog-sync]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[catalog-sync] démarré')
  setTimeout(tick, deps.pollMs)
}
