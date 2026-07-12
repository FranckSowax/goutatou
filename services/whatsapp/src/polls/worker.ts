import type { WhapiClient } from '@goutatou/whapi'
import { nextSendDelayMs } from '../campaigns/throttle.js'
import type { ClaimedPoll, PollRepo } from './repo.js'

export interface PollWorkerDeps {
  repo: PollRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendPoll' | 'sendQuiz'>
  sleep: (ms: number) => Promise<void>
  rng?: () => number
  sendDelayMinMs: number
  sendDelayMaxMs: number
}

const CHANNEL_ERROR = 'L’envoi a échoué — vérifiez le canal WhatsApp.'
const NO_CHANNEL_ERROR = 'Créez d’abord votre chaîne WhatsApp.'
const NO_OPTIN_ERROR = 'Aucun client opt-in — faites scanner votre QR PROMOS.'
const ALL_FAILED_ERROR = 'Tous les envois ont échoué — vérifiez le canal.'

export async function processPollOnce(poll: ClaimedPoll, deps: PollWorkerDeps): Promise<void> {
  try {
    const channel = await deps.repo.getChannel(poll.restaurantId)
    if (!channel || channel.status !== 'active') {
      await deps.repo.finish(poll.id, { status: 'failed', sentCount: 0, error: CHANNEL_ERROR })
      return
    }
    const whapi = deps.makeWhapi(channel.token)
    const send = (to: string) =>
      poll.quizCorrect != null
        ? whapi.sendQuiz(to, poll.question, poll.options, poll.quizCorrect)
        : whapi.sendPoll(to, poll.question, poll.options)

    if (poll.target === 'channel') {
      if (!channel.waChannelId) {
        await deps.repo.finish(poll.id, { status: 'failed', sentCount: 0, error: NO_CHANNEL_ERROR })
        return
      }
      try {
        await send(channel.waChannelId)
        await deps.repo.finish(poll.id, { status: 'sent', sentCount: 1 })
      } catch (err) {
        console.error('[poll-worker]', err)
        await deps.repo.finish(poll.id, { status: 'failed', sentCount: 0, error: CHANNEL_ERROR })
      }
      return
    }

    // target 'optin'
    const chatIds = await deps.repo.optInChatIds(poll.restaurantId)
    if (chatIds.length === 0) {
      await deps.repo.finish(poll.id, { status: 'failed', sentCount: 0, error: NO_OPTIN_ERROR })
      return
    }
    let successes = 0
    let failures = 0
    for (const chatId of chatIds) {
      try {
        await send(chatId)
        successes++
      } catch (err) {
        console.error('[poll-worker]', err)
        failures++
      }
      await deps.sleep(nextSendDelayMs(deps.sendDelayMinMs, deps.sendDelayMaxMs, deps.rng))
    }
    if (successes === 0) {
      await deps.repo.finish(poll.id, { status: 'failed', sentCount: 0, error: ALL_FAILED_ERROR })
    } else {
      await deps.repo.finish(poll.id, {
        status: 'sent',
        sentCount: successes,
        error: failures > 0 ? `${failures} envoi(s) en échec.` : null,
      })
    }
  } catch (err) {
    console.error('[poll-worker]', err)
    await deps.repo.finish(poll.id, { status: 'failed', sentCount: 0, error: CHANNEL_ERROR })
  }
}

export function startPollWorker(deps: PollWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      const due = await deps.repo.claimQueued()
      for (const poll of due) {
        await processPollOnce(poll, deps)
      }
    } catch (err) {
      console.error('[poll-worker]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[poll-worker] démarré')
  setTimeout(tick, deps.pollMs)
}
