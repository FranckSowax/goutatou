import type { WhapiClient } from '@goutatou/whapi'
import type { ChannelDecisionRepo } from './decision-repo.js'

export interface ChannelDecisionWorkerDeps {
  repo: ChannelDecisionRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'readPollVotes'>
  /** Horloge injectée — jamais Date.now() en dur. */
  now: () => Date
}

export const CHANNEL_GROUP_NOT_VALIDATED_ERROR = 'Non validé par le groupe.'

/**
 * Décision du sondage groupe pour les posts chaîne (mirror autostatus/decision-worker.ts) : Oui >
 * Non ET au moins 1 Oui → tous les posts du lot passent en `scheduled` (le créneau est déjà
 * atteint, le channel-posts worker les publiera au tick suivant) ; sinon → `canceled` (sécurité :
 * sans majorité claire de Oui, rien ne se publie). Best-effort par lot : une erreur (canal
 * indisponible, lecture des votes en échec) est loguée et n'empêche pas le traitement des autres
 * lots dus dans le même tick.
 */
export async function runChannelDecisionOnce(deps: ChannelDecisionWorkerDeps): Promise<void> {
  const nowIso = deps.now().toISOString()
  const batches = await deps.repo.listDueGroupBatches(nowIso)

  for (const batch of batches) {
    try {
      const channel = await deps.repo.getChannel(batch.restaurantId)
      if (!channel || channel.status !== 'active') {
        await deps.repo.cancelBatch(batch.postIds, CHANNEL_GROUP_NOT_VALIDATED_ERROR)
        continue
      }
      const whapi = deps.makeWhapi(channel.token)
      const { yes, no } = await whapi.readPollVotes(batch.approvalMessageId)
      if (yes > no && yes >= 1) {
        await deps.repo.approveBatch(batch.postIds)
      } else {
        await deps.repo.cancelBatch(batch.postIds, CHANNEL_GROUP_NOT_VALIDATED_ERROR)
      }
    } catch (err) {
      console.error('[channel-decision]', err)
    }
  }
}

export function startChannelDecisionWorker(deps: ChannelDecisionWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      await runChannelDecisionOnce(deps)
    } catch (err) {
      console.error('[channel-decision]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[channel-decision] démarré')
  setTimeout(tick, deps.pollMs)
}
