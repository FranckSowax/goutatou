import { describe, expect, it, vi } from 'vitest'
import { AUTO_CHANNEL_LEAD_MIN, runAutoChannelOnce } from '../src/autochannel/worker.js'
import type {
  AutoChannelCandidate,
  AutoChannelRepo,
  GeneratedChannelPostRef,
  NewChannelPostRow,
} from '../src/autochannel/repo.js'
import type { AutoStatusDish } from '../src/autostatus/repo.js'

const DISHES: AutoStatusDish[] = [
  { id: 'd1', name: 'Poulet braisé', price: 5000, photoUrl: 'https://x/d1.jpg' },
  { id: 'd2', name: 'Poisson braisé', price: 6000, photoUrl: 'https://x/d2.jpg' },
  { id: 'd3', name: 'Riz sauté', price: 3000, photoUrl: 'https://x/d3.jpg' },
]

function candidate(over: Partial<AutoChannelCandidate> = {}): AutoChannelCandidate {
  return {
    restaurantId: 'r1',
    name: 'Chez Démo',
    contactPhone: null,
    waChannelId: '120000000@newsletter',
    autoChannelTimes: ['11:30'],
    autoChannelCount: 1,
    autoChannelCursor: 0,
    autoChannelLastSlot: null,
    autoStatusValidation: 'none',
    autoStatusManagerPhone: null,
    staffGroupId: null,
    ...over,
  }
}

type MockAutoChannelRepo = AutoChannelRepo & {
  claimSlot: ReturnType<typeof vi.fn>
  insertScheduledPosts: ReturnType<typeof vi.fn>
  insertPendingApprovalPosts: ReturnType<typeof vi.fn>
  bumpCursor: ReturnType<typeof vi.fn>
  getPhotoDishes: ReturnType<typeof vi.fn>
  getChannel: ReturnType<typeof vi.fn>
  markFailed: ReturnType<typeof vi.fn>
  markApprovalRequested: ReturnType<typeof vi.fn>
}

function makeRepo(over: Partial<AutoChannelRepo> = {}, candidates: AutoChannelCandidate[] = [candidate()]): MockAutoChannelRepo {
  return {
    listCandidates: vi.fn().mockResolvedValue(candidates),
    claimSlot: vi.fn().mockResolvedValue(true),
    getPhotoDishes: vi.fn().mockResolvedValue(DISHES),
    bumpCursor: vi.fn().mockResolvedValue(undefined),
    insertScheduledPosts: vi.fn().mockResolvedValue(undefined),
    insertPendingApprovalPosts: vi.fn().mockImplementation(async (rows: NewChannelPostRow[]): Promise<GeneratedChannelPostRef[]> =>
      rows.map((r, i) => ({ id: `p${i + 1}`, content: r.content, mediaUrl: r.mediaUrl })),
    ),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markApprovalRequested: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as MockAutoChannelRepo
}

function makeWhapiStub(over: Partial<{ sendImage: ReturnType<typeof vi.fn>; sendQuickReplies: ReturnType<typeof vi.fn>; sendPoll: ReturnType<typeof vi.fn> }> = {}) {
  return {
    sendImage: vi.fn().mockResolvedValue({ id: 'img-1' }),
    sendQuickReplies: vi.fn().mockResolvedValue({ id: 'btn-1' }),
    sendPoll: vi.fn().mockResolvedValue({ id: 'poll-1' }),
    ...over,
  }
}

const NOW_1135_LIBREVILLE = new Date('2026-07-13T10:35:00Z') // 11:35 à Libreville (UTC+1)

describe('runAutoChannelOnce — créneau dû / non dû / déjà exécuté', () => {
  it('AUTO_CHANNEL_LEAD_MIN vaut 120', () => {
    expect(AUTO_CHANNEL_LEAD_MIN).toBe(120)
  })

  it('créneau pas encore dans la fenêtre d\'avance (now < créneau - 120min) → aucune génération', async () => {
    const repo = makeRepo({}, [candidate({ autoChannelTimes: ['18:30'] })])
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).not.toHaveBeenCalled()
    expect(repo.insertScheduledPosts).not.toHaveBeenCalled()
  })

  it('créneau dû (heure Libreville >= créneau) mode none → insertScheduledPosts N rows, scheduledAt = créneau UTC', async () => {
    const repo = makeRepo({}, [candidate({ autoChannelCount: 2 })])
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', null)
    expect(repo.insertScheduledPosts).toHaveBeenCalledTimes(1)
    const rows = repo.insertScheduledPosts.mock.calls[0][0] as NewChannelPostRow[]
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({
      restaurantId: 'r1',
      content: expect.stringContaining('Poulet braisé'),
      mediaUrl: 'https://x/d1.jpg',
      scheduledAt: '2026-07-13T10:30:00.000Z', // créneau 11:30 Libreville = 10:30 UTC
    })
    expect(rows[1].mediaUrl).toBe('https://x/d2.jpg')
    expect(repo.bumpCursor).toHaveBeenCalledWith('r1', 2)
  })

  it('slotKey <= lastSlot → skip (pas de double génération)', async () => {
    const repo = makeRepo({}, [candidate({ autoChannelLastSlot: '2026-07-13 11:30' })])
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).not.toHaveBeenCalled()
    expect(repo.insertScheduledPosts).not.toHaveBeenCalled()
  })

  it('claim perdu (retourne false) → pas de génération ni bump', async () => {
    const repo = makeRepo({ claimSlot: vi.fn().mockResolvedValue(false) })
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.insertScheduledPosts).not.toHaveBeenCalled()
    expect(repo.bumpCursor).not.toHaveBeenCalled()
  })

  it('0 plat disponible avec photo → skip silencieux (log), pas de génération ni bump', async () => {
    const repo = makeRepo({ getPhotoDishes: vi.fn().mockResolvedValue([]) })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.insertScheduledPosts).not.toHaveBeenCalled()
    expect(repo.bumpCursor).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[auto-channel]'))
    logSpy.mockRestore()
  })
})

describe('runAutoChannelOnce — légendes avec CTA Commander', () => {
  it('contactPhone renseigné → suffixe wa.me appendé à chaque post généré', async () => {
    const repo = makeRepo({}, [candidate({ contactPhone: '24177000001@s.whatsapp.net' })])
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    const rows = repo.insertScheduledPosts.mock.calls[0][0] as NewChannelPostRow[]
    expect(rows[0].content).toContain('👉 Commander : https://wa.me/24177000001')
  })

  it('contactPhone absent → aucun suffixe wa.me', async () => {
    const repo = makeRepo({}, [candidate({ contactPhone: null })])
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    const rows = repo.insertScheduledPosts.mock.calls[0][0] as NewChannelPostRow[]
    expect(rows[0].content).not.toContain('wa.me')
  })
})

describe('runAutoChannelOnce — dispatch mode "manager"', () => {
  it('numéro gérant configuré : image + boutons chapp:/chrej: envoyés, approval_message_id stocké', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusValidation: 'manager', autoStatusManagerPhone: '24177000001@s.whatsapp.net' }),
    ])
    const whapi = makeWhapiStub()
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.insertScheduledPosts).not.toHaveBeenCalled()
    expect(repo.insertPendingApprovalPosts).toHaveBeenCalledTimes(1)
    expect(whapi.sendImage).toHaveBeenCalledWith('24177000001@s.whatsapp.net', 'https://x/d1.jpg', expect.stringContaining('Poulet braisé'))
    expect(whapi.sendQuickReplies).toHaveBeenCalledWith('24177000001@s.whatsapp.net', 'Publier ce post chaîne ?', [
      { id: 'chapp:p1', title: '✅ Valider' },
      { id: 'chrej:p1', title: '❌ Refuser' },
    ])
    expect(repo.markApprovalRequested).toHaveBeenCalledWith(['p1'], 'btn-1', NOW_1135_LIBREVILLE.toISOString())
    expect(repo.markFailed).not.toHaveBeenCalled()
  })

  it('ni numéro gérant ni contact_phone → posts générés marqués failed FR, aucun envoi', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusValidation: 'manager', autoChannelCount: 2 })])
    const whapi = makeWhapiStub()
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.insertPendingApprovalPosts).toHaveBeenCalledTimes(1)
    expect(repo.markFailed).toHaveBeenCalledWith('p1', 'Renseignez le numéro du gérant validateur.')
    expect(repo.markFailed).toHaveBeenCalledWith('p2', 'Renseignez le numéro du gérant validateur.')
    expect(whapi.sendImage).not.toHaveBeenCalled()
    expect(whapi.sendQuickReplies).not.toHaveBeenCalled()
  })
})

describe('runAutoChannelOnce — dispatch mode "group"', () => {
  it('groupe configuré : image de chaque post puis UN SEUL sondage Oui/Non, approval_message_id stocké sur tout le lot', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusValidation: 'group', staffGroupId: '120000000@g.us', autoChannelCount: 2 }),
    ])
    const whapi = makeWhapiStub()
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.insertScheduledPosts).not.toHaveBeenCalled()
    expect(whapi.sendImage).toHaveBeenCalledTimes(2)
    expect(whapi.sendImage).toHaveBeenNthCalledWith(1, '120000000@g.us', 'https://x/d1.jpg', expect.stringContaining('Poulet braisé'))
    expect(whapi.sendImage).toHaveBeenNthCalledWith(2, '120000000@g.us', 'https://x/d2.jpg', expect.stringContaining('Poisson braisé'))
    expect(whapi.sendPoll).toHaveBeenCalledTimes(1)
    expect(whapi.sendPoll).toHaveBeenCalledWith('120000000@g.us', '📣 Publier les 2 posts chaîne du jour ?', ['Oui', 'Non'])
    expect(repo.markApprovalRequested).toHaveBeenCalledWith(['p1', 'p2'], 'poll-1', NOW_1135_LIBREVILLE.toISOString())
    expect(repo.markFailed).not.toHaveBeenCalled()
  })

  it('groupe staff absent → posts générés marqués failed FR, aucun envoi', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusValidation: 'group', staffGroupId: null })])
    const whapi = makeWhapiStub()
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.markFailed).toHaveBeenCalledWith('p1', "Créez d'abord le groupe Cuisine.")
    expect(whapi.sendImage).not.toHaveBeenCalled()
    expect(whapi.sendPoll).not.toHaveBeenCalled()
  })
})

describe('runAutoChannelOnce — plusieurs candidats', () => {
  it('n\'agit que sur les candidats dus, ignore les autres', async () => {
    const repo = makeRepo({}, [
      candidate({ restaurantId: 'r-due', autoChannelTimes: ['11:30'] }),
      candidate({ restaurantId: 'r-not-due', autoChannelTimes: ['18:30'] }),
    ])
    await runAutoChannelOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).toHaveBeenCalledTimes(1)
    expect(repo.claimSlot).toHaveBeenCalledWith('r-due', '2026-07-13 11:30', null)
  })
})
