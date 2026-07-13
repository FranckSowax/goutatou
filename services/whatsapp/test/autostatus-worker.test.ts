import { describe, expect, it, vi } from 'vitest'
import { AUTO_STATUS_LEAD_MIN, runAutoStatusOnce } from '../src/autostatus/worker.js'
import type {
  AutoStatusCandidate,
  AutoStatusDish,
  AutoStatusRepo,
  GeneratedStatusRef,
  NewAutoStatusRow,
} from '../src/autostatus/repo.js'

const DISHES: AutoStatusDish[] = [
  { id: 'd1', name: 'Poulet braisé', price: 5000, photoUrl: 'https://x/d1.jpg' },
  { id: 'd2', name: 'Poisson braisé', price: 6000, photoUrl: 'https://x/d2.jpg' },
  { id: 'd3', name: 'Riz sauté', price: 3000, photoUrl: 'https://x/d3.jpg' },
]

function candidate(over: Partial<AutoStatusCandidate> = {}): AutoStatusCandidate {
  return {
    restaurantId: 'r1',
    autoStatusTimes: ['11:30'],
    autoStatusCount: 1,
    autoStatusCursor: 0,
    autoStatusLastSlot: null,
    autoStatusValidation: 'none',
    autoStatusManagerPhone: null,
    contactPhone: null,
    staffGroupId: null,
    ...over,
  }
}

type MockAutoStatusRepo = AutoStatusRepo & {
  claimSlot: ReturnType<typeof vi.fn>
  insertGeneratedStatuses: ReturnType<typeof vi.fn>
  insertPendingApprovalStatuses: ReturnType<typeof vi.fn>
  bumpCursor: ReturnType<typeof vi.fn>
  getPhotoDishes: ReturnType<typeof vi.fn>
  getChannel: ReturnType<typeof vi.fn>
  markFailed: ReturnType<typeof vi.fn>
  markApprovalRequested: ReturnType<typeof vi.fn>
}

function makeRepo(over: Partial<AutoStatusRepo> = {}, candidates: AutoStatusCandidate[] = [candidate()]): MockAutoStatusRepo {
  return {
    listCandidates: vi.fn().mockResolvedValue(candidates),
    claimSlot: vi.fn().mockResolvedValue(true),
    getPhotoDishes: vi.fn().mockResolvedValue(DISHES),
    bumpCursor: vi.fn().mockResolvedValue(undefined),
    insertGeneratedStatuses: vi.fn().mockResolvedValue(undefined),
    insertPendingApprovalStatuses: vi.fn().mockImplementation(async (rows: NewAutoStatusRow[]): Promise<GeneratedStatusRef[]> =>
      rows.map((r, i) => ({ id: `s${i + 1}`, content: r.content, mediaUrl: r.mediaUrl })),
    ),
    getChannel: vi.fn().mockResolvedValue({ token: 'tok', status: 'active' }),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markApprovalRequested: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as MockAutoStatusRepo
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

describe('runAutoStatusOnce — créneau dû / non dû / déjà exécuté', () => {
  it('créneau dû (heure Libreville >= créneau, jamais exécuté) → claim + génère + bump, scheduledAt = créneau (pas "now")', async () => {
    const repo = makeRepo()
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', null)
    expect(repo.insertGeneratedStatuses).toHaveBeenCalledTimes(1)
    const rows = repo.insertGeneratedStatuses.mock.calls[0][0] as NewAutoStatusRow[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      restaurantId: 'r1',
      content: expect.stringContaining('Poulet braisé'),
      mediaUrl: 'https://x/d1.jpg',
      scheduledAt: '2026-07-13T10:30:00.000Z', // créneau 11:30 Libreville = 10:30 UTC — PAS "now" (10:35)
    })
    expect(repo.bumpCursor).toHaveBeenCalledWith('r1', 1)
  })

  it('créneau pas encore dans la fenêtre d\'avance (now < créneau - 120min) → aucune action', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusTimes: ['18:30'] })])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.claimSlot).not.toHaveBeenCalled()
    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
  })

  it('LEAD 120 min : now = créneau - 90min (dans la fenêtre) → dû, génère en avance', async () => {
    // NOW 11:35, créneau 13:00 → 13:00-120min = 11:00 <= 11:35 → dû (1h25 d\'avance, sous la fenêtre 2h).
    const repo = makeRepo({}, [candidate({ autoStatusTimes: ['13:00'] })])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 13:00', null)
    const rows = repo.insertGeneratedStatuses.mock.calls[0][0] as NewAutoStatusRow[]
    expect(rows[0].scheduledAt).toBe('2026-07-13T12:00:00.000Z') // créneau 13:00 Libreville = 12:00 UTC
  })

  it('LEAD 120 min : now = créneau - 150min (hors fenêtre) → pas encore dû', async () => {
    // NOW 11:35, créneau 14:00 → 14:00-120min = 12:00 > 11:35 → pas dû.
    const repo = makeRepo({}, [candidate({ autoStatusTimes: ['14:00'] })])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.claimSlot).not.toHaveBeenCalled()
  })

  it('AUTO_STATUS_LEAD_MIN vaut 120', () => {
    expect(AUTO_STATUS_LEAD_MIN).toBe(120)
  })

  it('créneau déjà exécuté aujourd\'hui (last_slot correspond) → aucune action', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusLastSlot: '2026-07-13 11:30' })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).not.toHaveBeenCalled()
    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
  })

  it('même heure HH:MM mais jour suivant (last_slot = veille) → re-exécute', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusLastSlot: '2026-07-12 11:30' })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', '2026-07-12 11:30')
    expect(repo.insertGeneratedStatuses).toHaveBeenCalledTimes(1)
  })

  it('claim perdu (retourne false) → pas de génération ni bump', async () => {
    const repo = makeRepo({ claimSlot: vi.fn().mockResolvedValue(false) })
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
    expect(repo.bumpCursor).not.toHaveBeenCalled()
  })

  it('deux créneaux dus dans le même tick → SEUL le plus récent est traité (pas de rattrapage)', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusTimes: ['08:00', '11:30'] })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).toHaveBeenCalledTimes(1)
    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', null)
    expect(repo.insertGeneratedStatuses).toHaveBeenCalledTimes(1)
  })

  it('RÉGRESSION revue : dernier créneau déjà exécuté → le créneau plus ancien ne re-déclenche JAMAIS', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusTimes: ['08:00', '11:30'], autoStatusLastSlot: '2026-07-13 11:30' }),
    ])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).not.toHaveBeenCalled()
    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
  })

  it('premier créneau exécuté, deuxième atteint → seul le deuxième part', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusTimes: ['08:00', '11:30'], autoStatusLastSlot: '2026-07-13 08:00' }),
    ])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).toHaveBeenCalledTimes(1)
    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', '2026-07-13 08:00')
  })
})

describe('runAutoStatusOnce — rotation et quota', () => {
  it('respecte auto_status_count : génère exactement N statuts', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusCount: 2 })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    const rows = repo.insertGeneratedStatuses.mock.calls[0][0] as NewAutoStatusRow[]
    expect(rows).toHaveLength(2)
    expect(rows[0].mediaUrl).toBe('https://x/d1.jpg')
    expect(rows[1].mediaUrl).toBe('https://x/d2.jpg')
  })

  it('rotation : repart du cursor et boucle sans répéter deux fois d\'affilée', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusCursor: 2, autoStatusCount: 3 })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    const rows = repo.insertGeneratedStatuses.mock.calls[0][0] as NewAutoStatusRow[]
    expect(rows.map((r) => r.mediaUrl)).toEqual(['https://x/d3.jpg', 'https://x/d1.jpg', 'https://x/d2.jpg'])
    expect(repo.bumpCursor).toHaveBeenCalledWith('r1', 2) // (2+3) % 3 = 2
  })

  it('0 plat disponible avec photo → skip silencieux (log), pas de génération ni bump', async () => {
    const repo = makeRepo({ getPhotoDishes: vi.fn().mockResolvedValue([]) })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
    expect(repo.bumpCursor).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[auto-status]'))
    logSpy.mockRestore()
  })

  it('gabarit de légende varie avec cursor + i (au moins deux gabarits différents sur 3 plats)', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusCount: 3 })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    const rows = repo.insertGeneratedStatuses.mock.calls[0][0] as NewAutoStatusRow[]
    const distinctCaptions = new Set(rows.map((r) => r.content))
    expect(distinctCaptions.size).toBe(3)
  })
})

describe('runAutoStatusOnce — plusieurs candidats', () => {
  it('n\'agit que sur les candidats dus, ignore les autres', async () => {
    const repo = makeRepo({}, [
      candidate({ restaurantId: 'r-due', autoStatusTimes: ['11:30'] }),
      candidate({ restaurantId: 'r-not-due', autoStatusTimes: ['18:30'] }),
    ])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => makeWhapiStub() })

    expect(repo.claimSlot).toHaveBeenCalledTimes(1)
    expect(repo.claimSlot).toHaveBeenCalledWith('r-due', '2026-07-13 11:30', null)
  })
})

describe('runAutoStatusOnce — dispatch mode "none" (inchangé)', () => {
  it('insère directement en scheduled, jamais de demande de validation', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusValidation: 'none' })])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.insertGeneratedStatuses).toHaveBeenCalledTimes(1)
    expect(repo.insertPendingApprovalStatuses).not.toHaveBeenCalled()
    expect(whapi.sendImage).not.toHaveBeenCalled()
    expect(whapi.sendQuickReplies).not.toHaveBeenCalled()
    expect(whapi.sendPoll).not.toHaveBeenCalled()
  })
})

describe('runAutoStatusOnce — dispatch mode "manager"', () => {
  it('numéro gérant configuré : image + boutons Valider/Refuser envoyés, approval_message_id stocké', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusValidation: 'manager', autoStatusManagerPhone: '24177000001@s.whatsapp.net' }),
    ])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
    expect(repo.insertPendingApprovalStatuses).toHaveBeenCalledTimes(1)
    expect(whapi.sendImage).toHaveBeenCalledWith('24177000001@s.whatsapp.net', 'https://x/d1.jpg', expect.stringContaining('Poulet braisé'))
    expect(whapi.sendQuickReplies).toHaveBeenCalledWith('24177000001@s.whatsapp.net', 'Publier ce statut ?', [
      { id: 'stapp:s1', title: '✅ Valider' },
      { id: 'strej:s1', title: '❌ Refuser' },
    ])
    expect(repo.markApprovalRequested).toHaveBeenCalledWith(['s1'], 'btn-1', NOW_1135_LIBREVILLE.toISOString())
    expect(repo.markFailed).not.toHaveBeenCalled()
  })

  it('numéro gérant absent mais contact_phone défini → repli sur contact_phone', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusValidation: 'manager', autoStatusManagerPhone: null, contactPhone: '24177000009@s.whatsapp.net' }),
    ])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(whapi.sendImage).toHaveBeenCalledWith('24177000009@s.whatsapp.net', expect.any(String), expect.any(String))
    expect(repo.markFailed).not.toHaveBeenCalled()
  })

  it('ni numéro gérant ni contact_phone → statuts générés marqués failed FR, aucun envoi', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusValidation: 'manager', autoStatusCount: 2 })])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.insertPendingApprovalStatuses).toHaveBeenCalledTimes(1)
    expect(repo.markFailed).toHaveBeenCalledWith('s1', 'Renseignez le numéro du gérant validateur.')
    expect(repo.markFailed).toHaveBeenCalledWith('s2', 'Renseignez le numéro du gérant validateur.')
    expect(whapi.sendImage).not.toHaveBeenCalled()
    expect(whapi.sendQuickReplies).not.toHaveBeenCalled()
  })

  it('plusieurs statuts : envoi best-effort — un échec sur un statut n\'empêche pas les autres', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusValidation: 'manager', autoStatusManagerPhone: '24177000001@s.whatsapp.net', autoStatusCount: 2 }),
    ])
    const sendImage = vi.fn()
      .mockRejectedValueOnce(new Error('whapi 500'))
      .mockResolvedValueOnce({ id: 'img-2' })
    const whapi = makeWhapiStub({ sendImage })
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(sendImage).toHaveBeenCalledTimes(2)
    // le 1er échoue (pas de markApprovalRequested pour s1), le 2e réussit
    expect(repo.markApprovalRequested).toHaveBeenCalledTimes(1)
    expect(repo.markApprovalRequested).toHaveBeenCalledWith(['s2'], 'btn-1', NOW_1135_LIBREVILLE.toISOString())
  })
})

describe('runAutoStatusOnce — dispatch mode "group"', () => {
  it('groupe configuré : image de chaque statut puis UN SEUL sondage Oui/Non, approval_message_id stocké sur tout le lot', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusValidation: 'group', staffGroupId: '120000000@g.us', autoStatusCount: 2 }),
    ])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
    expect(whapi.sendImage).toHaveBeenCalledTimes(2)
    expect(whapi.sendImage).toHaveBeenNthCalledWith(1, '120000000@g.us', 'https://x/d1.jpg', expect.stringContaining('Poulet braisé'))
    expect(whapi.sendImage).toHaveBeenNthCalledWith(2, '120000000@g.us', 'https://x/d2.jpg', expect.stringContaining('Poisson braisé'))
    expect(whapi.sendPoll).toHaveBeenCalledTimes(1)
    expect(whapi.sendPoll).toHaveBeenCalledWith('120000000@g.us', '📸 Publier les 2 statuts du jour ?', ['Oui', 'Non'])
    expect(repo.markApprovalRequested).toHaveBeenCalledWith(['s1', 's2'], 'poll-1', NOW_1135_LIBREVILLE.toISOString())
    expect(repo.markFailed).not.toHaveBeenCalled()
  })

  it('groupe staff absent → statuts générés marqués failed FR, aucun envoi', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusValidation: 'group', staffGroupId: null })])
    const whapi = makeWhapiStub()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE, makeWhapi: () => whapi })

    expect(repo.markFailed).toHaveBeenCalledWith('s1', "Créez d'abord le groupe Cuisine.")
    expect(whapi.sendImage).not.toHaveBeenCalled()
    expect(whapi.sendPoll).not.toHaveBeenCalled()
  })
})
