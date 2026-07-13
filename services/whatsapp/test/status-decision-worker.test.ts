import { describe, expect, it, vi } from 'vitest'
import { GROUP_NOT_VALIDATED_ERROR, runStatusDecisionOnce, type StatusDecisionWorkerDeps } from '../src/autostatus/decision-worker.js'
import type { DecisionRepo, PendingApprovalBatch } from '../src/autostatus/decision-repo.js'

const NOW = new Date('2026-07-13T12:00:00.000Z')

const BATCH: PendingApprovalBatch = { approvalMessageId: 'poll-1', restaurantId: 'r1', statusIds: ['s1', 's2'] }

function makeDeps(over: Partial<StatusDecisionWorkerDeps> = {}): {
  deps: StatusDecisionWorkerDeps
  repo: DecisionRepo
  readPollVotes: ReturnType<typeof vi.fn>
} {
  const readPollVotes = vi.fn().mockResolvedValue({ yes: 3, no: 1 })
  const repo: DecisionRepo = {
    listDueGroupBatches: vi.fn().mockResolvedValue([BATCH]),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    approveBatch: vi.fn().mockResolvedValue(undefined),
    cancelBatch: vi.fn().mockResolvedValue(undefined),
  }
  const deps: StatusDecisionWorkerDeps = { repo, makeWhapi: () => ({ readPollVotes }), now: () => NOW, ...over }
  return { deps, repo, readPollVotes }
}

describe('runStatusDecisionOnce', () => {
  it('Oui > Non et >= 1 Oui → approuve le lot (scheduled)', async () => {
    const { deps, repo } = makeDeps()
    await runStatusDecisionOnce(deps)

    expect(repo.approveBatch).toHaveBeenCalledWith(['s1', 's2'])
    expect(repo.cancelBatch).not.toHaveBeenCalled()
  })

  it('égalité Oui = Non → non validé, annule le lot', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    readPollVotes.mockResolvedValue({ yes: 2, no: 2 })

    await runStatusDecisionOnce(deps)

    expect(repo.cancelBatch).toHaveBeenCalledWith(['s1', 's2'], GROUP_NOT_VALIDATED_ERROR)
    expect(repo.approveBatch).not.toHaveBeenCalled()
  })

  it('0 vote (aucune réponse) → non validé, annule le lot', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    readPollVotes.mockResolvedValue({ yes: 0, no: 0 })

    await runStatusDecisionOnce(deps)

    expect(repo.cancelBatch).toHaveBeenCalledWith(['s1', 's2'], GROUP_NOT_VALIDATED_ERROR)
  })

  it('Non > Oui → non validé, annule le lot', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    readPollVotes.mockResolvedValue({ yes: 1, no: 4 })

    await runStatusDecisionOnce(deps)

    expect(repo.cancelBatch).toHaveBeenCalledWith(['s1', 's2'], GROUP_NOT_VALIDATED_ERROR)
  })

  it('aucun lot dû → aucun appel whapi ni repo de décision', async () => {
    const { deps, repo, readPollVotes } = makeDeps({})
    repo.listDueGroupBatches = vi.fn().mockResolvedValue([])

    await runStatusDecisionOnce(deps)

    expect(readPollVotes).not.toHaveBeenCalled()
    expect(repo.approveBatch).not.toHaveBeenCalled()
    expect(repo.cancelBatch).not.toHaveBeenCalled()
  })

  it('canal indisponible → annule le lot sans appeler readPollVotes', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 'tok', status: 'error' })

    await runStatusDecisionOnce(deps)

    expect(readPollVotes).not.toHaveBeenCalled()
    expect(repo.cancelBatch).toHaveBeenCalledWith(['s1', 's2'], GROUP_NOT_VALIDATED_ERROR)
  })

  it('plusieurs lots : un échec sur un lot (readPollVotes qui lève) n\'empêche pas le traitement des autres', async () => {
    const batch2: PendingApprovalBatch = { approvalMessageId: 'poll-2', restaurantId: 'r2', statusIds: ['s3'] }
    const { deps, repo, readPollVotes } = makeDeps()
    repo.listDueGroupBatches = vi.fn().mockResolvedValue([BATCH, batch2])
    readPollVotes
      .mockRejectedValueOnce(new Error('whapi 500'))
      .mockResolvedValueOnce({ yes: 5, no: 0 })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runStatusDecisionOnce(deps)

    expect(repo.approveBatch).toHaveBeenCalledWith(['s3'])
    expect(repo.cancelBatch).not.toHaveBeenCalled() // le lot en échec n'est ni approuvé ni annulé (best-effort, retry au tick suivant)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
