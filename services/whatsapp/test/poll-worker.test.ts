import { describe, expect, it, vi } from 'vitest'
import { processPollOnce, type PollWorkerDeps } from '../src/polls/worker.js'
import type { ClaimedPoll, PollRepo } from '../src/polls/repo.js'

function poll(over: Partial<ClaimedPoll> = {}): ClaimedPoll {
  return {
    id: 'p1', restaurantId: 'r1', question: 'Aimez-vous le poulet ?', options: ['Oui', 'Non'],
    quizCorrect: null, target: 'channel', surfaces: [], teaserImageUrl: null, ...over,
  }
}

function makeDeps(over: Partial<PollWorkerDeps> = {}): {
  deps: PollWorkerDeps
  sendPoll: ReturnType<typeof vi.fn>
  sendQuiz: ReturnType<typeof vi.fn>
  postStatusText: ReturnType<typeof vi.fn>
  postStatusMedia: ReturnType<typeof vi.fn>
  repo: PollRepo
} {
  const sendPoll = vi.fn().mockResolvedValue({ id: 'wa-msg' })
  const sendQuiz = vi.fn().mockResolvedValue({ id: 'wa-msg' })
  const postStatusText = vi.fn().mockResolvedValue({ id: 'status-msg' })
  const postStatusMedia = vi.fn().mockResolvedValue({ id: 'status-msg' })
  const repo: PollRepo = {
    claimQueued: vi.fn(),
    getChannel: vi.fn().mockResolvedValue({
      token: 'tok', status: 'active', waChannelId: 'chan-1', waChannelInvite: 'https://wa.me/channel/abc', staffGroupId: 'group-1',
    }),
    optInChatIds: vi.fn().mockResolvedValue([]),
    recordSurface: vi.fn().mockResolvedValue(undefined),
    insertTeaserStatus: vi.fn().mockResolvedValue('status-1'),
    finish: vi.fn().mockResolvedValue(undefined),
  }
  const deps: PollWorkerDeps = {
    repo,
    makeWhapi: () => ({ sendPoll, sendQuiz, postStatusText, postStatusMedia }),
    sleep: vi.fn().mockResolvedValue(undefined),
    rng: () => 0,
    sendDelayMinMs: 4000,
    sendDelayMaxMs: 8000,
    ...over,
  }
  return { deps, sendPoll, sendQuiz, postStatusText, postStatusMedia, repo }
}

describe('processPollOnce — target channel', () => {
  it('envoie un seul poll vers wa_channel_id → sent, sentCount 1', async () => {
    const { deps, sendPoll, repo } = makeDeps()
    await processPollOnce(poll(), deps)
    expect(sendPoll).toHaveBeenCalledWith('chan-1', 'Aimez-vous le poulet ?', ['Oui', 'Non'])
    expect(repo.finish).toHaveBeenCalledWith('p1', { status: 'sent', sentCount: 1 })
  })

  it('quiz_correct non null → sendQuiz avec l’index', async () => {
    const { deps, sendQuiz, sendPoll, repo } = makeDeps()
    await processPollOnce(poll({ quizCorrect: 1 }), deps)
    expect(sendQuiz).toHaveBeenCalledWith('chan-1', 'Aimez-vous le poulet ?', ['Oui', 'Non'], 1)
    expect(sendPoll).not.toHaveBeenCalled()
    expect(repo.finish).toHaveBeenCalledWith('p1', { status: 'sent', sentCount: 1 })
  })

  it('wa_channel_id manquant → failed « Créez d’abord votre chaîne WhatsApp. », aucun envoi', async () => {
    const { deps, sendPoll, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 'tok', status: 'active', waChannelId: null })
    await processPollOnce(poll(), deps)
    expect(sendPoll).not.toHaveBeenCalled()
    expect(repo.finish).toHaveBeenCalledWith('p1', {
      status: 'failed', sentCount: 0, error: 'Créez d’abord votre chaîne WhatsApp.',
    })
  })

  it('canal absent/inactif → failed FR générique, aucun envoi', async () => {
    const { deps, sendPoll, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue(null)
    await processPollOnce(poll(), deps)
    expect(sendPoll).not.toHaveBeenCalled()
    expect(repo.finish).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'failed', sentCount: 0 }))
  })

  it('échec Whapi sur l’envoi unique → failed FR', async () => {
    const { deps, sendPoll, repo } = makeDeps()
    sendPoll.mockRejectedValueOnce(new Error('whapi 500'))
    await processPollOnce(poll(), deps)
    expect(repo.finish).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'failed', sentCount: 0 }))
  })
})

describe('processPollOnce — target optin', () => {
  it('0 client opt-in → failed « Aucun client opt-in — faites scanner votre QR PROMOS. »', async () => {
    const { deps, sendPoll, repo } = makeDeps()
    repo.optInChatIds = vi.fn().mockResolvedValue([])
    await processPollOnce(poll({ target: 'optin' }), deps)
    expect(sendPoll).not.toHaveBeenCalled()
    expect(repo.finish).toHaveBeenCalledWith('p1', {
      status: 'failed', sentCount: 0, error: 'Aucun client opt-in — faites scanner votre QR PROMOS.',
    })
  })

  it('3 clients, 1 échec → sent, sentCount 2, erreur partielle FR', async () => {
    const { deps, sendPoll, repo } = makeDeps()
    repo.optInChatIds = vi.fn().mockResolvedValue(['a@s.whatsapp.net', 'b@s.whatsapp.net', 'c@s.whatsapp.net'])
    sendPoll
      .mockResolvedValueOnce({ id: '1' })
      .mockRejectedValueOnce(new Error('whapi 500'))
      .mockResolvedValueOnce({ id: '3' })
    await processPollOnce(poll({ target: 'optin' }), deps)
    expect(sendPoll).toHaveBeenCalledTimes(3)
    expect(repo.finish).toHaveBeenCalledWith('p1', {
      status: 'sent', sentCount: 2, error: '1 envoi(s) en échec.',
    })
  })

  it('throttle appelé entre chaque envoi opt-in', async () => {
    const { deps, repo } = makeDeps()
    repo.optInChatIds = vi.fn().mockResolvedValue(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
    await processPollOnce(poll({ target: 'optin' }), deps)
    expect((deps.sleep as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(2)
  })

  it('tous les envois échouent → failed « Tous les envois ont échoué — vérifiez le canal. »', async () => {
    const { deps, sendPoll, repo } = makeDeps()
    repo.optInChatIds = vi.fn().mockResolvedValue(['a@s.whatsapp.net', 'b@s.whatsapp.net'])
    sendPoll.mockRejectedValue(new Error('whapi 500'))
    await processPollOnce(poll({ target: 'optin' }), deps)
    expect(repo.finish).toHaveBeenCalledWith('p1', {
      status: 'failed', sentCount: 0, error: 'Tous les envois ont échoué — vérifiez le canal.',
    })
  })

  it('quiz_correct non null → sendQuiz appelé pour chaque client opt-in', async () => {
    const { deps, sendQuiz, sendPoll, repo } = makeDeps()
    repo.optInChatIds = vi.fn().mockResolvedValue(['a@s.whatsapp.net'])
    await processPollOnce(poll({ target: 'optin', quizCorrect: 0 }), deps)
    expect(sendQuiz).toHaveBeenCalledWith('a@s.whatsapp.net', 'Aimez-vous le poulet ?', ['Oui', 'Non'], 0)
    expect(sendPoll).not.toHaveBeenCalled()
  })
})

describe('processPollOnce — surfaces v2', () => {
  it("surfaces=['channel'] → sendPoll(waChannelId) + recordSurface channel sent avec messageId", async () => {
    const { deps, sendPoll, repo } = makeDeps()
    await processPollOnce(poll({ surfaces: ['channel'] }), deps)
    expect(sendPoll).toHaveBeenCalledWith('chan-1', 'Aimez-vous le poulet ?', ['Oui', 'Non'])
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'channel', { status: 'sent', messageId: 'wa-msg' })
    expect(repo.finish).toHaveBeenCalledWith('p1', { status: 'sent', sentCount: 1 })
  })

  it("surfaces=['group'] → sendPoll(staffGroupId) + recordSurface group sent avec messageId", async () => {
    const { deps, sendPoll, repo } = makeDeps()
    await processPollOnce(poll({ surfaces: ['group'] }), deps)
    expect(sendPoll).toHaveBeenCalledWith('group-1', 'Aimez-vous le poulet ?', ['Oui', 'Non'])
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'group', { status: 'sent', messageId: 'wa-msg' })
    expect(repo.finish).toHaveBeenCalledWith('p1', { status: 'sent', sentCount: 1 })
  })

  it("surfaces=['group'] sans staff_group_id → failed, aucun envoi", async () => {
    const { deps, sendPoll, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({
      token: 'tok', status: 'active', waChannelId: 'chan-1', waChannelInvite: 'https://wa.me/channel/abc', staffGroupId: null,
    })
    await processPollOnce(poll({ surfaces: ['group'] }), deps)
    expect(sendPoll).not.toHaveBeenCalled()
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'group', { status: 'failed' })
    expect(repo.finish).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'failed', sentCount: 0 }))
  })

  it("surfaces=['status_teaser'] avec chaîne+invite → insertTeaserStatus avec un texte contenant le lien, recordSurface sent", async () => {
    const { deps, repo } = makeDeps()
    await processPollOnce(poll({ surfaces: ['status_teaser'], teaserImageUrl: 'https://x/img.jpg' }), deps)
    expect(repo.insertTeaserStatus).toHaveBeenCalledWith(
      'r1',
      expect.stringContaining('https://wa.me/channel/abc'),
      'https://x/img.jpg',
      'p1',
    )
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'status_teaser', { status: 'sent' })
    expect(repo.finish).toHaveBeenCalledWith('p1', { status: 'sent', sentCount: 1 })
  })

  it("surfaces=['status_teaser'] sans wa_channel_invite → failed, aucun insertTeaserStatus", async () => {
    const { deps, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({
      token: 'tok', status: 'active', waChannelId: 'chan-1', waChannelInvite: null, staffGroupId: 'group-1',
    })
    await processPollOnce(poll({ surfaces: ['status_teaser'] }), deps)
    expect(repo.insertTeaserStatus).not.toHaveBeenCalled()
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'status_teaser', { status: 'failed' })
    expect(repo.finish).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'failed', sentCount: 0 }))
  })

  it("surfaces=['channel','group','status_teaser'] : une échoue (group), les autres OK best-effort", async () => {
    const { deps, sendPoll, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({
      token: 'tok', status: 'active', waChannelId: 'chan-1', waChannelInvite: 'https://wa.me/channel/abc', staffGroupId: null,
    })
    await processPollOnce(poll({ surfaces: ['channel', 'group', 'status_teaser'] }), deps)
    expect(sendPoll).toHaveBeenCalledTimes(1)
    expect(sendPoll).toHaveBeenCalledWith('chan-1', 'Aimez-vous le poulet ?', ['Oui', 'Non'])
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'channel', { status: 'sent', messageId: 'wa-msg' })
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'group', { status: 'failed' })
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'status_teaser', { status: 'sent' })
    expect(repo.finish).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'sent', sentCount: 2 }))
  })

  it("quiz_correct non nul + surfaces=['group'] → sendQuiz avec l’index", async () => {
    const { deps, sendQuiz, sendPoll, repo } = makeDeps()
    await processPollOnce(poll({ surfaces: ['group'], quizCorrect: 1 }), deps)
    expect(sendQuiz).toHaveBeenCalledWith('group-1', 'Aimez-vous le poulet ?', ['Oui', 'Non'], 1)
    expect(sendPoll).not.toHaveBeenCalled()
    expect(repo.finish).toHaveBeenCalledWith('p1', { status: 'sent', sentCount: 1 })
  })

  it("rétrocompat : surfaces=[] + target='channel' → traité comme ['channel']", async () => {
    const { deps, sendPoll, repo } = makeDeps()
    await processPollOnce(poll({ surfaces: [] }), deps)
    expect(sendPoll).toHaveBeenCalledWith('chan-1', 'Aimez-vous le poulet ?', ['Oui', 'Non'])
    expect(repo.recordSurface).toHaveBeenCalledWith('p1', 'channel', { status: 'sent', messageId: 'wa-msg' })
    expect(repo.finish).toHaveBeenCalledWith('p1', { status: 'sent', sentCount: 1 })
  })
})

describe('processPollOnce — erreurs inattendues', () => {
  it('repo.getChannel lève → failed FR générique, aucune exception propagée', async () => {
    const { deps, repo } = makeDeps()
    repo.getChannel = vi.fn().mockRejectedValue(new Error('réseau'))
    await expect(processPollOnce(poll(), deps)).resolves.toBeUndefined()
    expect(repo.finish).toHaveBeenCalledWith('p1', expect.objectContaining({ status: 'failed', sentCount: 0 }))
  })
})
