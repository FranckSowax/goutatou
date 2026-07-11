import { describe, expect, it, vi } from 'vitest'
import { processReminderOnce, reminderMessage, type WheelReminderWorkerDeps } from '../src/wheel/worker.js'
import type { DueReminder, WheelReminderRepo } from '../src/wheel/repo.js'

const reminder: DueReminder = {
  id: 'ws1', restaurantId: 'r1', chatId: '24177000001@s.whatsapp.net', label: 'Café offert', expiresAt: '2026-07-14T10:00:00.000Z',
}

function makeDeps(over: Partial<WheelReminderWorkerDeps> = {}): { deps: WheelReminderWorkerDeps; sendText: ReturnType<typeof vi.fn>; repo: WheelReminderRepo } {
  const sendText = vi.fn().mockResolvedValue({ id: 'X' })
  const repo: WheelReminderRepo = {
    claimExpiringSpins: vi.fn(),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
  }
  const deps: WheelReminderWorkerDeps = { repo, makeWhapi: () => ({ sendText }), ...over }
  return { deps, sendText, repo }
}

describe('reminderMessage', () => {
  it('formate le message FR avec le libellé et la date', () => {
    const msg = reminderMessage('Café offert', '2026-07-14T10:00:00.000Z')
    expect(msg).toContain('Café offert')
    expect(msg).toContain('expire le')
    expect(msg).toContain('pensez à le récupérer')
  })
})

describe('processReminderOnce', () => {
  it('canal actif : envoie le rappel WhatsApp avec le libellé et la date', async () => {
    const { deps, sendText } = makeDeps()
    await processReminderOnce(reminder, deps)
    expect(sendText).toHaveBeenCalledTimes(1)
    const [chatId, body] = sendText.mock.calls[0]
    expect(chatId).toBe('24177000001@s.whatsapp.net')
    expect(body).toContain('Café offert')
    expect(body).toContain('⏰')
  })

  it('canal inactif → aucun envoi (pas d’erreur levée)', async () => {
    const { deps, sendText, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue({ token: 't', status: 'error' })
    await expect(processReminderOnce(reminder, deps)).resolves.toBeUndefined()
    expect(sendText).not.toHaveBeenCalled()
  })

  it('canal introuvable → aucun envoi', async () => {
    const { deps, sendText, repo } = makeDeps()
    repo.getChannel = vi.fn().mockResolvedValue(null)
    await processReminderOnce(reminder, deps)
    expect(sendText).not.toHaveBeenCalled()
  })

  it('échec d’envoi Whapi : best-effort, ne lève pas (le claim reminded_at est déjà posé côté DB)', async () => {
    const { deps, sendText } = makeDeps()
    sendText.mockRejectedValueOnce(new Error('whapi 500'))
    await expect(processReminderOnce(reminder, deps)).resolves.toBeUndefined()
  })
})
