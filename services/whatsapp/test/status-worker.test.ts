import { describe, expect, it, vi } from 'vitest'
import { processStatusOnce, type StatusWorkerDeps } from '../src/statuses/worker.js'
import type { DueStatus, StatusRepo } from '../src/statuses/repo.js'

const status: DueStatus = { id: 's1', restaurantId: 'r1', kind: 'text', content: 'Promo du jour !', mediaUrl: null }

function makeDeps(over: Partial<StatusWorkerDeps> = {}): { deps: StatusWorkerDeps; postStatusText: ReturnType<typeof vi.fn>; postStatusMedia: ReturnType<typeof vi.fn>; repo: StatusRepo } {
  const postStatusText = vi.fn().mockResolvedValue({ id: 'X' })
  const postStatusMedia = vi.fn().mockResolvedValue({ id: 'Y' })
  const repo: StatusRepo = {
    claimDue: vi.fn(),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    markPosted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  }
  const deps: StatusWorkerDeps = {
    repo, makeWhapi: () => ({ postStatusText, postStatusMedia }), ...over,
  }
  return { deps, postStatusText, postStatusMedia, repo }
}

describe('processStatusOnce', () => {
  it('statut texte avec canal actif → publie et marque posted', async () => {
    const { deps, postStatusText, repo } = makeDeps()
    await processStatusOnce(status, deps)
    expect(postStatusText).toHaveBeenCalledWith('Promo du jour !')
    expect(repo.markPosted).toHaveBeenCalledWith('s1', 'X')
  })

  it('un échec Whapi marque failed sans lever', async () => {
    const { deps, postStatusText, repo } = makeDeps()
    postStatusText.mockRejectedValueOnce(new Error('whapi 500'))
    await expect(processStatusOnce(status, deps)).resolves.toBeUndefined()
    expect(repo.markFailed).toHaveBeenCalledWith('s1', expect.stringContaining('whapi'))
  })

  it('canal inactif → marque failed sans publier', async () => {
    const { deps, postStatusText, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 't', status: 'error' })
    await processStatusOnce(status, deps)
    expect(postStatusText).not.toHaveBeenCalled()
    expect(repo.markFailed).toHaveBeenCalledWith('s1', expect.any(String))
  })
})
