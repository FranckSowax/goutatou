import type { PollSurface } from '@goutatou/db'
import type { WhapiClient } from '@goutatou/whapi'
import { nextSendDelayMs } from '../campaigns/throttle.js'
import type { ClaimedPoll, PollRepo } from './repo.js'

export interface PollWorkerDeps {
  repo: PollRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'sendPoll' | 'sendQuiz' | 'postStatusText' | 'postStatusMedia'>
  sleep: (ms: number) => Promise<void>
  rng?: () => number
  sendDelayMinMs: number
  sendDelayMaxMs: number
}

const CHANNEL_ERROR = 'L’envoi a échoué — vérifiez le canal WhatsApp.'
const NO_CHANNEL_ERROR = 'Créez d’abord votre chaîne WhatsApp.'
const NO_GROUP_ERROR = 'Configurez d’abord votre groupe staff.'
const NO_TEASER_ERROR = 'Chaîne ou lien d’invitation manquant pour le statut-teaser.'
const TEASER_CHANNEL_FAILED = 'Sondage chaîne en échec — statut-teaser non publié (rien à annoncer).'
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

    // Ligne historique 'optin' (jamais produite par la v2, conservée telle quelle pour les
    // sondages déjà en base avant la migration multi-surfaces) : comportement inchangé.
    if (poll.target === 'optin') {
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
      return
    }

    // Multi-surfaces (v2). Rétrocompat : lignes historiques `surfaces` vide + `target==='channel'`
    // → traitées comme `['channel']` (migration douce 0027 couvre déjà la majorité des lignes,
    // ce fallback couvre celles non migrées / créées entre migration et déploiement bot).
    const requested: PollSurface[] = poll.surfaces.length > 0 ? poll.surfaces : poll.target === 'channel' ? ['channel'] : []

    if (requested.length === 0) {
      await deps.repo.finish(poll.id, { status: 'failed', sentCount: 0, error: CHANNEL_ERROR })
      return
    }

    // Ordre canonique channel→group→status_teaser : le teaser dépend du SUCCÈS de la chaîne (il
    // annonce le sondage natif publié dessus), on doit donc traiter `channel` avant `status_teaser`
    // quel que soit l'ordre stocké en base.
    const surfaces = (['channel', 'group', 'status_teaser'] as PollSurface[]).filter((s) => requested.includes(s))
    const wantsChannel = requested.includes('channel')

    let sentCount = 0
    let channelSucceeded = false
    const errors: string[] = []

    for (const surface of surfaces) {
      try {
        if (surface === 'channel') {
          if (!channel.waChannelId) {
            await deps.repo.recordSurface(poll.id, 'channel', { status: 'failed' })
            errors.push(NO_CHANNEL_ERROR)
            continue
          }
          const res = await send(channel.waChannelId)
          await deps.repo.recordSurface(poll.id, 'channel', { status: 'sent', messageId: res.id })
          channelSucceeded = true
          sentCount++
        } else if (surface === 'group') {
          if (!channel.staffGroupId) {
            await deps.repo.recordSurface(poll.id, 'group', { status: 'failed' })
            errors.push(NO_GROUP_ERROR)
            continue
          }
          const res = await send(channel.staffGroupId)
          await deps.repo.recordSurface(poll.id, 'group', { status: 'sent', messageId: res.id })
          sentCount++
        } else if (surface === 'status_teaser') {
          if (!channel.waChannelId || !channel.waChannelInvite) {
            await deps.repo.recordSurface(poll.id, 'status_teaser', { status: 'failed' })
            errors.push(NO_TEASER_ERROR)
            continue
          }
          // Le teaser annonce le sondage natif de la chaîne : on ne le publie QUE si l'envoi chaîne
          // a réussi ce tour-ci (sinon les abonnés cliquent et ne trouvent aucun vote). `wantsChannel`
          // est toujours vrai en pratique (normalizeSurfaces force channel), le garde-fou couvre les
          // insertions directes en base sans channel.
          if (!wantsChannel || !channelSucceeded) {
            await deps.repo.recordSurface(poll.id, 'status_teaser', { status: 'failed' })
            errors.push(TEASER_CHANNEL_FAILED)
            continue
          }
          const text = `📊 ${poll.question}\n\nVotez sur notre chaîne 👉 ${channel.waChannelInvite}`
          await deps.repo.insertTeaserStatus(poll.restaurantId, text, poll.teaserImageUrl, poll.id)
          await deps.repo.recordSurface(poll.id, 'status_teaser', { status: 'sent' })
          sentCount++
        }
      } catch (err) {
        console.error('[poll-worker]', err)
        try {
          await deps.repo.recordSurface(poll.id, surface, { status: 'failed' })
        } catch (recordErr) {
          console.error('[poll-worker]', recordErr)
        }
        errors.push(CHANNEL_ERROR)
      }
    }

    if (sentCount > 0) {
      const result: { status: 'sent'; sentCount: number; error?: string } = { status: 'sent', sentCount }
      if (errors.length > 0) result.error = errors.join(' ')
      await deps.repo.finish(poll.id, result)
    } else {
      await deps.repo.finish(poll.id, { status: 'failed', sentCount: 0, error: errors[0] ?? ALL_FAILED_ERROR })
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
