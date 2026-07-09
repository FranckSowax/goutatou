import type { WhapiClient } from '@goutatou/whapi'
import type { DueStatus, StatusRepo } from './repo.js'

export interface StatusWorkerDeps {
  repo: StatusRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'postStatusText' | 'postStatusMedia'>
}

export async function processStatusOnce(s: DueStatus, deps: StatusWorkerDeps): Promise<void> {
  const channel = await deps.repo.getChannel(s.restaurantId)
  if (!channel || channel.status !== 'active') {
    await deps.repo.markFailed(s.id, 'canal inactif')
    return
  }
  const whapi = deps.makeWhapi(channel.token)
  try {
    const res = s.kind === 'image' && s.mediaUrl
      ? await whapi.postStatusMedia(s.mediaUrl, s.content)
      : await whapi.postStatusText(s.content)
    await deps.repo.markPosted(s.id, res.id)
  } catch (err) {
    await deps.repo.markFailed(s.id, String(err))
  }
}

export function startStatusWorker(deps: StatusWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      const due = await deps.repo.claimDue(new Date().toISOString())
      for (const s of due) {
        await processStatusOnce(s, deps)
      }
    } catch (err) {
      console.error('[status-worker]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[status-worker] démarré')
  setTimeout(tick, deps.pollMs)
}
