import type { WhapiClient } from '@goutatou/whapi'
import type { DecisionRepo } from './decision-repo.js'

export interface StatusDecisionWorkerDeps {
  repo: DecisionRepo
  makeWhapi: (token: string) => Pick<WhapiClient, 'readPollVotes'>
  /** Horloge injectée — jamais Date.now() en dur. */
  now: () => Date
}

export const GROUP_NOT_VALIDATED_ERROR = 'Non validé par le groupe.'

/**
 * Décision du sondage groupe (spec docs/superpowers/specs/2026-07-13-validation-statuts-design.md
 * §3) : Oui > Non ET au moins 1 Oui → tous les statuts du lot passent en `scheduled` (le créneau
 * est déjà atteint, le status worker les publiera au tick suivant) ; sinon → `canceled` (sécurité :
 * sans majorité claire de Oui, rien ne se publie). Best-effort par lot : une erreur (canal
 * indisponible, lecture des votes en échec) est loguée et n'empêche pas le traitement des autres
 * lots dus dans le même tick.
 */
export async function runStatusDecisionOnce(deps: StatusDecisionWorkerDeps): Promise<void> {
  const nowIso = deps.now().toISOString()
  const batches = await deps.repo.listDueGroupBatches(nowIso)

  for (const batch of batches) {
    try {
      const channel = await deps.repo.getChannel(batch.restaurantId)
      if (!channel || channel.status !== 'active') {
        await deps.repo.cancelBatch(batch.statusIds, GROUP_NOT_VALIDATED_ERROR)
        continue
      }
      const whapi = deps.makeWhapi(channel.token)
      const { yes, no } = await whapi.readPollVotes(batch.approvalMessageId)
      if (yes > no && yes >= 1) {
        await deps.repo.approveBatch(batch.statusIds)
      } else {
        await deps.repo.cancelBatch(batch.statusIds, GROUP_NOT_VALIDATED_ERROR)
      }
    } catch (err) {
      console.error('[status-decision]', err)
    }
  }
}

export function startStatusDecisionWorker(deps: StatusDecisionWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      await runStatusDecisionOnce(deps)
    } catch (err) {
      console.error('[status-decision]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[status-decision] démarré')
  setTimeout(tick, deps.pollMs)
}
