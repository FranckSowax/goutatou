import type { WhapiClient } from '@goutatou/whapi'
import { nextSendDelayMs } from './throttle.js'
import type { CampaignRepo, DueCampaign } from './repo.js'

export interface WorkerDeps {
  repo: CampaignRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendText' | 'sendImage'>
  sleep: (ms: number) => Promise<void>
  rng?: () => number
  dailyCap: number
  sendDelayMinMs: number
  sendDelayMaxMs: number
  batchSize: number
}

export async function processCampaignOnce(campaign: DueCampaign, deps: WorkerDeps): Promise<void> {
  if (await deps.repo.isCanceled(campaign.id)) return
  if ((await deps.repo.sentTodayCount(campaign.restaurantId)) >= deps.dailyCap) return

  const channel = await deps.repo.getChannel(campaign.restaurantId)
  if (!channel || channel.status !== 'active') return
  const whapi = deps.makeWhapi(channel.token)

  const batch = await deps.repo.nextPendingBatch(campaign.id, deps.batchSize)
  for (const r of batch) {
    if (await deps.repo.isCanceled(campaign.id)) return
    try {
      if (campaign.mediaUrl) await whapi.sendImage(r.chatId, campaign.mediaUrl, campaign.body)
      else await whapi.sendText(r.chatId, campaign.body)
      await deps.repo.markRecipient(r.recipientId, campaign.id, true, undefined)
    } catch (err) {
      await deps.repo.markRecipient(r.recipientId, campaign.id, false, String(err))
    }
    await deps.sleep(nextSendDelayMs(deps.sendDelayMinMs, deps.sendDelayMaxMs, deps.rng))
  }
  await deps.repo.finalizeIfDone(campaign.id)
}

export function startCampaignWorker(deps: WorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      const due = await deps.repo.claimScheduledDue(new Date().toISOString())
      for (const c of due) {
        // snapshot idempotent si pas encore fait
        await deps.repo.snapshotRecipients(c.id, c.restaurantId)
        await processCampaignOnce(c, deps)
      }
    } catch (err) {
      console.error('[campaign-worker]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[campaign-worker] démarré')
  setTimeout(tick, deps.pollMs)
}
