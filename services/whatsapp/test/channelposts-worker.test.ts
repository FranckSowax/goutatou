import { describe, expect, it, vi } from 'vitest'
import { processChannelPostOnce, runChannelPostsWorkerOnce, type ChannelPostsWorkerDeps } from '../src/channelposts/worker.js'
import type { ChannelPostsRepo, DueChannelPost } from '../src/channelposts/repo.js'

const NOW = new Date('2026-07-13T12:00:00.000Z')

const textPost: DueChannelPost = {
  id: 'p1', restaurantId: 'r1', kind: 'text', content: 'Promo du jour !', mediaUrl: null, pollOptions: null, waChannelId: '999@newsletter',
}

function makeDeps(over: Partial<ChannelPostsWorkerDeps> = {}): {
  deps: ChannelPostsWorkerDeps
  sendNewsletterText: ReturnType<typeof vi.fn>
  sendNewsletterImage: ReturnType<typeof vi.fn>
  sendChannelVideo: ReturnType<typeof vi.fn>
  sendPoll: ReturnType<typeof vi.fn>
  repo: ChannelPostsRepo
} {
  const sendNewsletterText = vi.fn().mockResolvedValue({ id: 'X' })
  const sendNewsletterImage = vi.fn().mockResolvedValue({ id: 'Y' })
  const sendChannelVideo = vi.fn().mockResolvedValue({ id: 'Z' })
  const sendPoll = vi.fn().mockResolvedValue({ id: 'W' })
  const repo: ChannelPostsRepo = {
    cancelExpiredPendingApproval: vi.fn().mockResolvedValue(undefined),
    claimDue: vi.fn().mockResolvedValue([]),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    markPosted: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  }
  const deps: ChannelPostsWorkerDeps = {
    repo, makeWhapi: () => ({ sendNewsletterText, sendNewsletterImage, sendChannelVideo, sendPoll }), now: () => NOW, ...over,
  }
  return { deps, sendNewsletterText, sendNewsletterImage, sendChannelVideo, sendPoll, repo }
}

describe('processChannelPostOnce', () => {
  it('kind text → sendNewsletterText et marque posted', async () => {
    const { deps, sendNewsletterText, repo } = makeDeps()
    await processChannelPostOnce(textPost, deps)
    expect(sendNewsletterText).toHaveBeenCalledWith('999@newsletter', 'Promo du jour !')
    expect(repo.markPosted).toHaveBeenCalledWith('p1', 'X')
  })

  it('kind image → sendNewsletterImage et marque posted', async () => {
    const { deps, sendNewsletterImage, repo } = makeDeps()
    const post: DueChannelPost = { id: 'p2', restaurantId: 'r1', kind: 'image', content: 'Photo du jour', mediaUrl: 'https://cdn/dish.jpg', pollOptions: null, waChannelId: '999@newsletter' }
    await processChannelPostOnce(post, deps)
    expect(sendNewsletterImage).toHaveBeenCalledWith('999@newsletter', 'https://cdn/dish.jpg', 'Photo du jour')
    expect(repo.markPosted).toHaveBeenCalledWith('p2', 'Y')
  })

  it('kind menu_card → sendNewsletterImage et marque posted', async () => {
    const { deps, sendNewsletterImage, repo } = makeDeps()
    const post: DueChannelPost = { id: 'p3', restaurantId: 'r1', kind: 'menu_card', content: 'Carte du menu', mediaUrl: 'https://cdn/menu.png', pollOptions: null, waChannelId: '999@newsletter' }
    await processChannelPostOnce(post, deps)
    expect(sendNewsletterImage).toHaveBeenCalledWith('999@newsletter', 'https://cdn/menu.png', 'Carte du menu')
    expect(repo.markPosted).toHaveBeenCalledWith('p3', 'Y')
  })

  it('kind video → sendChannelVideo et marque posted', async () => {
    const { deps, sendChannelVideo, repo } = makeDeps()
    const post: DueChannelPost = { id: 'p4', restaurantId: 'r1', kind: 'video', content: 'Vidéo promo', mediaUrl: 'https://cdn/promo.mp4', pollOptions: null, waChannelId: '999@newsletter' }
    await processChannelPostOnce(post, deps)
    expect(sendChannelVideo).toHaveBeenCalledWith('999@newsletter', 'https://cdn/promo.mp4', 'Vidéo promo')
    expect(repo.markPosted).toHaveBeenCalledWith('p4', 'Z')
  })

  it('kind poll → sendPoll et marque posted', async () => {
    const { deps, sendPoll, repo } = makeDeps()
    const post: DueChannelPost = { id: 'p5', restaurantId: 'r1', kind: 'poll', content: 'Votre plat préféré ?', mediaUrl: null, pollOptions: ['Poulet', 'Poisson'], waChannelId: '999@newsletter' }
    await processChannelPostOnce(post, deps)
    expect(sendPoll).toHaveBeenCalledWith('999@newsletter', 'Votre plat préféré ?', ['Poulet', 'Poisson'])
    expect(repo.markPosted).toHaveBeenCalledWith('p5', 'W')
  })

  it('canal inactif → marque failed sans publier', async () => {
    const { deps, sendNewsletterText, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 't', status: 'error' })
    await processChannelPostOnce(textPost, deps)
    expect(sendNewsletterText).not.toHaveBeenCalled()
    expect(repo.markFailed).toHaveBeenCalledWith('p1', 'canal inactif')
  })

  it('waChannelId absent → marque failed sans publier ni appeler getChannel', async () => {
    const { deps, sendNewsletterText, repo } = makeDeps()
    const noChannel: DueChannelPost = { id: 'p6', restaurantId: 'r1', kind: 'text', content: 'Promo', mediaUrl: null, pollOptions: null, waChannelId: null }
    await processChannelPostOnce(noChannel, deps)
    expect(sendNewsletterText).not.toHaveBeenCalled()
    expect(repo.markFailed).toHaveBeenCalledWith('p6', 'canal inactif')
  })

  it('un échec Whapi marque failed sans lever', async () => {
    const { deps, sendNewsletterText, repo } = makeDeps()
    sendNewsletterText.mockRejectedValueOnce(new Error('whapi 500'))
    await expect(processChannelPostOnce(textPost, deps)).resolves.toBeUndefined()
    expect(repo.markFailed).toHaveBeenCalledWith('p1', expect.stringContaining('whapi'))
  })
})

describe('runChannelPostsWorkerOnce', () => {
  it('annule d\'abord les pending_approval expirés, PUIS réclame et publie les scheduled dus (ordre)', async () => {
    const { deps, sendNewsletterText, repo } = makeDeps()
    const calls: string[] = []
    repo.cancelExpiredPendingApproval = vi.fn().mockImplementation(async () => { calls.push('cancel') })
    repo.claimDue = vi.fn().mockImplementation(async () => {
      calls.push('claim')
      return [textPost]
    })

    await runChannelPostsWorkerOnce(deps)

    expect(calls).toEqual(['cancel', 'claim'])
    expect(repo.cancelExpiredPendingApproval).toHaveBeenCalledWith(NOW.toISOString())
    expect(repo.claimDue).toHaveBeenCalledWith(NOW.toISOString())
    expect(sendNewsletterText).toHaveBeenCalledWith('999@newsletter', 'Promo du jour !')
    expect(repo.markPosted).toHaveBeenCalledWith('p1', 'X')
  })

  it('post pending_approval mode gérant expiré → canceled AVANT claimDue, aucune publication', async () => {
    const { deps, sendNewsletterText, sendNewsletterImage, sendChannelVideo, sendPoll, repo } = makeDeps()
    // claimDue ne renvoie rien : le post expiré a déjà été annulé par cancelExpiredPendingApproval
    // et n'est donc jamais passé en 'scheduled'/'posting'.
    repo.claimDue = vi.fn().mockResolvedValue([])

    await runChannelPostsWorkerOnce(deps)

    expect(repo.cancelExpiredPendingApproval).toHaveBeenCalledTimes(1)
    expect(sendNewsletterText).not.toHaveBeenCalled()
    expect(sendNewsletterImage).not.toHaveBeenCalled()
    expect(sendChannelVideo).not.toHaveBeenCalled()
    expect(sendPoll).not.toHaveBeenCalled()
  })

  it('aucun post dû → aucune publication, cancel appelé quand même', async () => {
    const { deps, sendNewsletterText, repo } = makeDeps()
    repo.claimDue = vi.fn().mockResolvedValue([])

    await runChannelPostsWorkerOnce(deps)

    expect(repo.cancelExpiredPendingApproval).toHaveBeenCalledTimes(1)
    expect(sendNewsletterText).not.toHaveBeenCalled()
  })
})
