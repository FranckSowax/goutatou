import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startCampaignWorker, type WorkerDeps } from '../src/campaigns/worker.js'
import type { CampaignRepo } from '../src/campaigns/repo.js'
import { runStatusWorkerOnce, type StatusWorkerDeps } from '../src/statuses/worker.js'
import type { DueStatus, StatusRepo } from '../src/statuses/repo.js'
import { startCatalogWorker, type CatalogWorkerDeps } from '../src/catalog/worker.js'
import type { CatalogRepo } from '../src/catalog/repo.js'
import { startWheelReminderWorker, type WheelReminderWorkerDeps } from '../src/wheel/worker.js'
import type { WheelReminderRepo } from '../src/wheel/repo.js'

/**
 * Audit lot B — correctif 3 : dans chaque worker, un throw sur UN item ne doit pas abandonner les
 * items suivants du même tick (comportement déjà en place dans polls/analysis).
 */

const POLL_MS = 1000

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

/** Déclenche un tick du worker (les workers s'amorcent via setTimeout(tick, pollMs)). */
async function runOneTick() {
  await vi.advanceTimersByTimeAsync(POLL_MS)
}

describe('campaign worker — isolation par campagne', () => {
  it('une campagne en erreur ne fait pas sauter les suivantes du tick', async () => {
    const repo = {
      claimScheduledDue: vi.fn().mockResolvedValue([
        { id: 'c1', restaurantId: 'r1', body: 'A', mediaUrl: null },
        { id: 'c2', restaurantId: 'r2', body: 'B', mediaUrl: null },
      ]),
      snapshotRecipients: vi.fn(async (id: string) => {
        if (id === 'c1') throw new Error('snapshot cassé')
        return 0
      }),
      nextPendingBatch: vi.fn().mockResolvedValue([]),
      getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
      markRecipient: vi.fn(),
      sentTodayCount: vi.fn().mockResolvedValue(0),
      finalizeIfDone: vi.fn().mockResolvedValue(undefined),
      isCanceled: vi.fn().mockResolvedValue(false),
    } as unknown as CampaignRepo
    const deps: WorkerDeps & { pollMs: number } = {
      repo, makeWhapi: () => ({ sendText: vi.fn(), sendImage: vi.fn(), checkContact: vi.fn() }),
      sleep: vi.fn().mockResolvedValue(undefined), rng: () => 0,
      dailyCap: 500, sendDelayMinMs: 0, sendDelayMaxMs: 0, batchSize: 50, pollMs: POLL_MS,
    }

    startCampaignWorker(deps)
    await runOneTick()

    expect(repo.snapshotRecipients).toHaveBeenCalledTimes(2)
    expect(repo.finalizeIfDone).toHaveBeenCalledWith('c2') // la 2e campagne a bien été traitée
  })
})

describe('status worker — isolation par statut', () => {
  it('un statut en erreur ne fait pas sauter les suivants du tick', async () => {
    const due: DueStatus[] = [
      { id: 's1', restaurantId: 'r1', kind: 'text', content: 'A', mediaUrl: null },
      { id: 's2', restaurantId: 'r2', kind: 'text', content: 'B', mediaUrl: null },
    ]
    const getChannel = vi.fn(async (restaurantId: string) => {
      if (restaurantId === 'r1') throw new Error('canal illisible')
      return { token: 'tok', status: 'active' }
    })
    const postStatusText = vi.fn().mockResolvedValue({ id: 'W1' })
    const repo = {
      claimDue: vi.fn().mockResolvedValue(due),
      cancelExpiredPendingApproval: vi.fn().mockResolvedValue(undefined),
      getChannel,
      optInChatIds: vi.fn().mockResolvedValue([]),
      markPosted: vi.fn().mockResolvedValue(undefined),
      markFailed: vi.fn().mockResolvedValue(undefined),
    } as unknown as StatusRepo
    const deps: StatusWorkerDeps = {
      repo,
      makeWhapi: () => ({
        postStatusText, postStatusMedia: vi.fn(), sendNewsletterImage: vi.fn(), sendNewsletterText: vi.fn(),
      }),
      now: () => new Date('2026-07-20T12:00:00.000Z'),
    }

    await runStatusWorkerOnce(deps)

    expect(postStatusText).toHaveBeenCalledTimes(1)
    expect(repo.markPosted).toHaveBeenCalledWith('s2', 'W1')
  })
})

describe('catalog worker — isolation par restaurant', () => {
  it('une sync en erreur ne fait pas sauter les restaurants suivants du tick', async () => {
    const getChannel = vi.fn(async (restaurantId: string) => {
      if (restaurantId === 'r1') throw new Error('canal illisible')
      return { token: 'tok', status: 'active' }
    })
    const repo = {
      claimSyncRequests: vi.fn().mockResolvedValue([{ restaurantId: 'r1' }, { restaurantId: 'r2' }]),
      getChannel,
      getSyncableItems: vi.fn().mockResolvedValue([]),
      getAllItemIds: vi.fn().mockResolvedValue(new Set<string>()),
      setWaProductId: vi.fn(),
      clearWaProductId: vi.fn(),
      finishSync: vi.fn().mockResolvedValue(undefined),
    } as unknown as CatalogRepo
    const deps: CatalogWorkerDeps & { pollMs: number } = {
      repo,
      makeWhapi: () => ({
        getProducts: vi.fn().mockResolvedValue([]), createProduct: vi.fn(), updateProduct: vi.fn(), deleteProduct: vi.fn(),
      }),
      sleep: vi.fn().mockResolvedValue(undefined), rng: () => 0, sendDelayMinMs: 0, sendDelayMaxMs: 0, pollMs: POLL_MS,
    }

    startCatalogWorker(deps)
    await runOneTick()

    expect(getChannel).toHaveBeenCalledTimes(2)
    expect(repo.finishSync).toHaveBeenCalledWith('r2', null)
  })
})

describe('wheel reminder worker — isolation par rappel', () => {
  it('un rappel en erreur ne fait pas sauter les suivants du tick', async () => {
    const getChannel = vi.fn(async (restaurantId: string) => {
      if (restaurantId === 'r1') throw new Error('canal illisible')
      return { token: 'tok', status: 'active' }
    })
    const sendText = vi.fn().mockResolvedValue({ id: 'W' })
    const repo = {
      claimExpiringSpins: vi.fn().mockResolvedValue([
        { id: 'w1', restaurantId: 'r1', chatId: '1@s.whatsapp.net', label: 'Café', expiresAt: '2026-07-22T10:00:00.000Z' },
        { id: 'w2', restaurantId: 'r2', chatId: '2@s.whatsapp.net', label: 'Dessert', expiresAt: '2026-07-22T10:00:00.000Z' },
      ]),
      getChannel,
    } as unknown as WheelReminderRepo
    const deps: WheelReminderWorkerDeps & { pollMs: number } = {
      repo, makeWhapi: () => ({ sendText }), pollMs: POLL_MS,
    }

    startWheelReminderWorker(deps)
    await runOneTick()

    expect(getChannel).toHaveBeenCalledTimes(2)
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith('2@s.whatsapp.net', expect.stringContaining('Dessert'))
  })
})
