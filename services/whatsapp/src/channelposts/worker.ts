import type { WhapiClient } from '@goutatou/whapi'
import type { ChannelPostsRepo, DueChannelPost } from './repo.js'

export interface ChannelPostsWorkerDeps {
  repo: ChannelPostsRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendNewsletterText' | 'sendNewsletterImage' | 'sendChannelVideo' | 'sendPoll'>
  /** Horloge injectée — jamais Date.now() en dur (contrat de test, cf. autostatus/worker.ts). */
  now: () => Date
}

export async function processChannelPostOnce(post: DueChannelPost, deps: ChannelPostsWorkerDeps): Promise<void> {
  if (!post.waChannelId) {
    await deps.repo.markFailed(post.id, 'canal inactif')
    return
  }

  const channel = await deps.repo.getChannel(post.restaurantId)
  if (!channel || channel.status !== 'active') {
    await deps.repo.markFailed(post.id, 'canal inactif')
    return
  }

  const whapi = deps.makeWhapi(channel.token)
  try {
    let res: { id?: string }
    if (post.kind === 'text') {
      res = await whapi.sendNewsletterText(post.waChannelId, post.content)
    } else if (post.kind === 'image' || post.kind === 'menu_card') {
      res = await whapi.sendNewsletterImage(post.waChannelId, post.mediaUrl ?? '', post.content || undefined)
    } else if (post.kind === 'video') {
      res = await whapi.sendChannelVideo(post.waChannelId, post.mediaUrl ?? '', post.content || undefined)
    } else {
      // 'poll'
      res = await whapi.sendPoll(post.waChannelId, post.content, post.pollOptions ?? [])
    }
    await deps.repo.markPosted(post.id, res.id)
  } catch (err) {
    await deps.repo.markFailed(post.id, String(err))
  }
}

/**
 * Un tick complet : (1) annule d'abord les `pending_approval` mode gérant dont le créneau est
 * dépassé sans validation (sécurité « sans réponse = ne pas publier », cf. channelposts/repo.ts
 * cancelExpiredPendingApproval) — AVANT de réclamer les `scheduled` dus, pour ne jamais publier un
 * post resté en attente. (2) publie ensuite les `scheduled` dus.
 */
export async function runChannelPostsWorkerOnce(deps: ChannelPostsWorkerDeps): Promise<void> {
  const nowIso = deps.now().toISOString()
  await deps.repo.cancelExpiredPendingApproval(nowIso)
  const due = await deps.repo.claimDue(nowIso)
  for (const post of due) {
    await processChannelPostOnce(post, deps)
  }
}

export function startChannelPostsWorker(deps: ChannelPostsWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      await runChannelPostsWorkerOnce(deps)
    } catch (err) {
      console.error('[channel-posts]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[channel-posts] démarré')
  setTimeout(tick, deps.pollMs)
}
