import { describe, expect, it, vi } from 'vitest'
import { processCampaignOnce, type WorkerDeps } from '../src/campaigns/worker.js'
import type { CampaignRepo, DueCampaign } from '../src/campaigns/repo.js'

const campaign: DueCampaign = { id: 'camp1', restaurantId: 'r1', body: 'Promo -20% ce weekend !', mediaUrl: null }

function makeDeps(over: Partial<WorkerDeps> = {}): {
  deps: WorkerDeps; sendText: ReturnType<typeof vi.fn>; checkContact: ReturnType<typeof vi.fn>; repo: CampaignRepo
} {
  const sendText = vi.fn().mockResolvedValue({ id: 'X' })
  const checkContact = vi.fn().mockResolvedValue(true)
  const repo: CampaignRepo = {
    claimScheduledDue: vi.fn(), snapshotRecipients: vi.fn(),
    nextPendingBatch: vi.fn()
      .mockResolvedValueOnce([
        { recipientId: 'a', chatId: '1@s.whatsapp.net', phone: '24177000001' },
        { recipientId: 'b', chatId: '2@s.whatsapp.net', phone: '24177000002' },
      ])
      .mockResolvedValue([]),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    markRecipient: vi.fn().mockResolvedValue(undefined),
    sentTodayCount: vi.fn().mockResolvedValue(0),
    finalizeIfDone: vi.fn().mockResolvedValue(undefined),
    isCanceled: vi.fn().mockResolvedValue(false),
  }
  const deps: WorkerDeps = {
    repo, makeWhapi: () => ({ sendText, sendImage: vi.fn(), checkContact }), sleep: vi.fn().mockResolvedValue(undefined),
    rng: () => 0, dailyCap: 500, sendDelayMinMs: 4000, sendDelayMaxMs: 8000, batchSize: 50, ...over,
  }
  return { deps, sendText, checkContact, repo }
}

describe('processCampaignOnce', () => {
  it('envoie chaque destinataire du lot, throttlé, et marque sent', async () => {
    const { deps, sendText, repo } = makeDeps()
    await processCampaignOnce(campaign, deps)
    expect(sendText).toHaveBeenCalledTimes(2)
    expect(sendText).toHaveBeenCalledWith('1@s.whatsapp.net', 'Promo -20% ce weekend !')
    expect(repo.markRecipient).toHaveBeenCalledWith('a', 'camp1', true, undefined)
    expect(deps.sleep).toHaveBeenCalled() // throttle entre envois
    expect(repo.finalizeIfDone).toHaveBeenCalledWith('camp1')
  })

  it('un échec Whapi marque failed sans stopper le lot', async () => {
    const { deps, sendText, repo } = makeDeps()
    sendText.mockRejectedValueOnce(new Error('whapi 500'))
    await processCampaignOnce(campaign, deps)
    expect(repo.markRecipient).toHaveBeenCalledWith('a', 'camp1', false, expect.stringContaining('whapi'))
    expect(repo.markRecipient).toHaveBeenCalledWith('b', 'camp1', true, undefined)
  })

  it('campagne annulée → ne rien envoyer', async () => {
    const { deps, sendText, repo } = makeDeps()
    repo.isCanceled = vi.fn().mockResolvedValue(true)
    await processCampaignOnce(campaign, deps)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('cap journalier atteint → ne rien envoyer ce tour', async () => {
    const { deps, sendText, repo } = makeDeps()
    repo.sentTodayCount = vi.fn().mockResolvedValue(500)
    await processCampaignOnce(campaign, deps)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('canal inactif → ne rien envoyer', async () => {
    const { deps, sendText, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 't', status: 'error' })
    await processCampaignOnce(campaign, deps)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('numéro invalide (pré-validation) → failed "numéro invalide", aucun envoi, aucun throttle pour ce destinataire', async () => {
    const { deps, sendText, checkContact, repo } = makeDeps({
      // 'a' invalide (241 + 4 chiffres, ni 8 ni 9) ; 'b' valide
    })
    repo.nextPendingBatch = vi.fn()
      .mockResolvedValueOnce([
        { recipientId: 'a', chatId: '1@s.whatsapp.net', phone: '2417700' },
        { recipientId: 'b', chatId: '2@s.whatsapp.net', phone: '24177000002' },
      ])
      .mockResolvedValue([])
    await processCampaignOnce(campaign, deps)
    expect(checkContact).not.toHaveBeenCalledWith('2417700')
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith('2@s.whatsapp.net', 'Promo -20% ce weekend !')
    expect(repo.markRecipient).toHaveBeenCalledWith('a', 'camp1', false, 'numéro invalide')
    expect(repo.markRecipient).toHaveBeenCalledWith('b', 'camp1', true, undefined)
    // Un seul sleep (throttle), consommé uniquement pour 'b' — pas pour 'a' (numéro invalide).
    expect((deps.sleep as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('checkContact false (pas de WhatsApp) → failed "numéro invalide", aucun envoi ni throttle', async () => {
    const { deps, sendText, checkContact, repo } = makeDeps()
    checkContact.mockResolvedValueOnce(false) // 'a' n'a pas WhatsApp
    await processCampaignOnce(campaign, deps)
    expect(sendText).toHaveBeenCalledTimes(1)
    expect(sendText).toHaveBeenCalledWith('2@s.whatsapp.net', 'Promo -20% ce weekend !')
    expect(repo.markRecipient).toHaveBeenCalledWith('a', 'camp1', false, 'numéro invalide')
    expect((deps.sleep as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('checkContact échoue (réseau) → fail-open, numéro traité comme valide, envoi tenté', async () => {
    const { deps, sendText, checkContact } = makeDeps()
    checkContact.mockRejectedValueOnce(new Error('réseau'))
    await processCampaignOnce(campaign, deps)
    expect(sendText).toHaveBeenCalledTimes(2)
  })
})
