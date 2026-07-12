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
    optInChatIds: vi.fn().mockResolvedValue([]),
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

  it('statut vidéo → postStatusMedia avec mime video/mp4', async () => {
    const { deps, postStatusMedia, repo } = makeDeps()
    const video: DueStatus = { id: 's2', restaurantId: 'r1', kind: 'video', content: 'Nouveau menu vidéo', mediaUrl: 'https://cdn/promo.mp4' }
    await processStatusOnce(video, deps)
    expect(postStatusMedia).toHaveBeenCalledWith('https://cdn/promo.mp4', 'Nouveau menu vidéo', { mime: 'video/mp4' })
    expect(repo.markPosted).toHaveBeenCalledWith('s2', 'Y')
  })

  it('statut image sans style ni audience VIP → postStatusMedia inchangé (2 args, rétrocompat)', async () => {
    const { deps, postStatusMedia } = makeDeps()
    const image: DueStatus = { id: 's3', restaurantId: 'r1', kind: 'image', content: 'Promo', mediaUrl: 'https://cdn/promo.jpg' }
    await processStatusOnce(image, deps)
    expect(postStatusMedia).toHaveBeenCalledWith('https://cdn/promo.jpg', 'Promo')
  })

  it('statut texte avec styles (fond/légende/police) → transmis à postStatusText', async () => {
    const { deps, postStatusText } = makeDeps()
    const styled: DueStatus = {
      id: 's4', restaurantId: 'r1', kind: 'text', content: 'Promo VIP !', mediaUrl: null,
      bgColor: '#FF128C7E', captionColor: '#FFFFFFFF', fontType: 1,
    }
    await processStatusOnce(styled, deps)
    expect(postStatusText).toHaveBeenCalledWith('Promo VIP !', {
      backgroundColor: '#FF128C7E', captionColor: '#FFFFFFFF', fontType: 'SYSTEM_BOLD',
    })
  })

  it('audience optin avec clients opt-in → contacts transmis au client whapi', async () => {
    const { deps, postStatusText, repo } = makeDeps()
    repo.optInChatIds = vi.fn().mockResolvedValue(['24177000001@s.whatsapp.net', '24177000002@s.whatsapp.net'])
    const vip: DueStatus = { id: 's5', restaurantId: 'r1', kind: 'text', content: 'Promo VIP', mediaUrl: null, audience: 'optin' }
    await processStatusOnce(vip, deps)
    expect(repo.optInChatIds).toHaveBeenCalledWith('r1')
    expect(postStatusText).toHaveBeenCalledWith('Promo VIP', {
      contacts: ['24177000001@s.whatsapp.net', '24177000002@s.whatsapp.net'],
    })
    expect(repo.markPosted).toHaveBeenCalledWith('s5', 'X')
  })

  it('audience optin sans aucun client opt-in → marque failed FR sans appeler Whapi', async () => {
    const { deps, postStatusText, postStatusMedia, repo } = makeDeps()
    repo.optInChatIds = vi.fn().mockResolvedValue([])
    const vip: DueStatus = { id: 's6', restaurantId: 'r1', kind: 'text', content: 'Promo VIP', mediaUrl: null, audience: 'optin' }
    await processStatusOnce(vip, deps)
    expect(postStatusText).not.toHaveBeenCalled()
    expect(postStatusMedia).not.toHaveBeenCalled()
    expect(repo.markFailed).toHaveBeenCalledWith('s6', 'Aucun client opt-in pour ce statut VIP.')
  })

  it('statut vidéo ciblé VIP → mime + contacts combinés', async () => {
    const { deps, postStatusMedia, repo } = makeDeps()
    repo.optInChatIds = vi.fn().mockResolvedValue(['24177000001@s.whatsapp.net'])
    const video: DueStatus = {
      id: 's7', restaurantId: 'r1', kind: 'video', content: 'Vidéo VIP', mediaUrl: 'https://cdn/vip.mp4', audience: 'optin',
    }
    await processStatusOnce(video, deps)
    expect(postStatusMedia).toHaveBeenCalledWith('https://cdn/vip.mp4', 'Vidéo VIP', {
      mime: 'video/mp4', contacts: ['24177000001@s.whatsapp.net'],
    })
  })
})
