import { describe, expect, it, vi } from 'vitest'
import { CHANNEL_GROUP_NOT_VALIDATED_ERROR, runChannelDecisionOnce, type ChannelDecisionWorkerDeps } from '../src/autochannel/decision-worker.js'
import type { ChannelDecisionRepo, PendingApprovalChannelBatch } from '../src/autochannel/decision-repo.js'

const NOW = new Date('2026-07-13T12:00:00.000Z')

const BATCH: PendingApprovalChannelBatch = { approvalMessageId: 'poll-1', restaurantId: 'r1', postIds: ['p1', 'p2'] }

function makeDeps(over: Partial<ChannelDecisionWorkerDeps> = {}): {
  deps: ChannelDecisionWorkerDeps
  repo: ChannelDecisionRepo
  readPollVotes: ReturnType<typeof vi.fn>
} {
  const readPollVotes = vi.fn().mockResolvedValue({ yes: 3, no: 1 })
  const repo: ChannelDecisionRepo = {
    listDueGroupBatches: vi.fn().mockResolvedValue([BATCH]),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    approveBatch: vi.fn().mockResolvedValue(undefined),
    cancelBatch: vi.fn().mockResolvedValue(undefined),
  }
  const deps: ChannelDecisionWorkerDeps = { repo, makeWhapi: () => ({ readPollVotes }), now: () => NOW, ...over }
  return { deps, repo, readPollVotes }
}

describe('runChannelDecisionOnce', () => {
  it('Oui > Non et >= 1 Oui → approuve le lot (scheduled)', async () => {
    const { deps, repo } = makeDeps()
    await runChannelDecisionOnce(deps)

    expect(repo.approveBatch).toHaveBeenCalledWith(['p1', 'p2'])
    expect(repo.cancelBatch).not.toHaveBeenCalled()
  })

  it('égalité Oui = Non → non validé, annule le lot', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    readPollVotes.mockResolvedValue({ yes: 2, no: 2 })

    await runChannelDecisionOnce(deps)

    expect(repo.cancelBatch).toHaveBeenCalledWith(['p1', 'p2'], CHANNEL_GROUP_NOT_VALIDATED_ERROR)
    expect(repo.approveBatch).not.toHaveBeenCalled()
  })

  it('0 vote (aucune réponse) → non validé, annule le lot', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    readPollVotes.mockResolvedValue({ yes: 0, no: 0 })

    await runChannelDecisionOnce(deps)

    expect(repo.cancelBatch).toHaveBeenCalledWith(['p1', 'p2'], CHANNEL_GROUP_NOT_VALIDATED_ERROR)
  })

  it('Non > Oui → non validé, annule le lot', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    readPollVotes.mockResolvedValue({ yes: 1, no: 4 })

    await runChannelDecisionOnce(deps)

    expect(repo.cancelBatch).toHaveBeenCalledWith(['p1', 'p2'], CHANNEL_GROUP_NOT_VALIDATED_ERROR)
  })

  it('aucun lot dû → aucun appel whapi ni repo de décision', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    repo.listDueGroupBatches = vi.fn().mockResolvedValue([])

    await runChannelDecisionOnce(deps)

    expect(readPollVotes).not.toHaveBeenCalled()
    expect(repo.approveBatch).not.toHaveBeenCalled()
    expect(repo.cancelBatch).not.toHaveBeenCalled()
  })

  it('canal indisponible → annule le lot sans appeler readPollVotes', async () => {
    const { deps, repo, readPollVotes } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 'tok', status: 'error' })

    await runChannelDecisionOnce(deps)

    expect(readPollVotes).not.toHaveBeenCalled()
    expect(repo.cancelBatch).toHaveBeenCalledWith(['p1', 'p2'], CHANNEL_GROUP_NOT_VALIDATED_ERROR)
  })

  it('plusieurs lots : un échec sur un lot n\'empêche pas le traitement des autres', async () => {
    const batch2: PendingApprovalChannelBatch = { approvalMessageId: 'poll-2', restaurantId: 'r2', postIds: ['p3'] }
    const { deps, repo, readPollVotes } = makeDeps()
    repo.listDueGroupBatches = vi.fn().mockResolvedValue([BATCH, batch2])
    readPollVotes
      .mockRejectedValueOnce(new Error('whapi 500'))
      .mockResolvedValueOnce({ yes: 5, no: 0 })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    await runChannelDecisionOnce(deps)

    expect(repo.approveBatch).toHaveBeenCalledWith(['p3'])
    expect(repo.cancelBatch).not.toHaveBeenCalled()
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
  })
})
