import { describe, expect, it, vi } from 'vitest'
import { runAutoStatusOnce } from '../src/autostatus/worker.js'
import type { AutoStatusCandidate, AutoStatusDish, AutoStatusRepo, NewAutoStatusRow } from '../src/autostatus/repo.js'

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
    ...over,
  }
}

function makeRepo(over: Partial<AutoStatusRepo> = {}, candidates: AutoStatusCandidate[] = [candidate()]): AutoStatusRepo & {
  claimSlot: ReturnType<typeof vi.fn>
  insertGeneratedStatuses: ReturnType<typeof vi.fn>
  bumpCursor: ReturnType<typeof vi.fn>
  getPhotoDishes: ReturnType<typeof vi.fn>
} {
  return {
    listCandidates: vi.fn().mockResolvedValue(candidates),
    claimSlot: vi.fn().mockResolvedValue(true),
    getPhotoDishes: vi.fn().mockResolvedValue(DISHES),
    bumpCursor: vi.fn().mockResolvedValue(undefined),
    insertGeneratedStatuses: vi.fn().mockResolvedValue(undefined),
    ...over,
  } as AutoStatusRepo & {
    claimSlot: ReturnType<typeof vi.fn>
    insertGeneratedStatuses: ReturnType<typeof vi.fn>
    bumpCursor: ReturnType<typeof vi.fn>
    getPhotoDishes: ReturnType<typeof vi.fn>
  }
}

const NOW_1135_LIBREVILLE = new Date('2026-07-13T10:35:00Z') // 11:35 à Libreville (UTC+1)

describe('runAutoStatusOnce — créneau dû / non dû / déjà exécuté', () => {
  it('créneau dû (heure Libreville >= créneau, jamais exécuté) → claim + génère + bump', async () => {
    const repo = makeRepo()
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', null)
    expect(repo.insertGeneratedStatuses).toHaveBeenCalledTimes(1)
    const rows = repo.insertGeneratedStatuses.mock.calls[0][0] as NewAutoStatusRow[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      restaurantId: 'r1',
      content: expect.stringContaining('Poulet braisé'),
      mediaUrl: 'https://x/d1.jpg',
      scheduledAt: NOW_1135_LIBREVILLE.toISOString(),
    })
    expect(repo.bumpCursor).toHaveBeenCalledWith('r1', 1)
  })

  it('créneau pas encore atteint (heure Libreville < créneau) → aucune action', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusTimes: ['18:30'] })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.claimSlot).not.toHaveBeenCalled()
    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
  })

  it('créneau déjà exécuté aujourd\'hui (last_slot correspond) → aucune action', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusLastSlot: '2026-07-13 11:30' })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.claimSlot).not.toHaveBeenCalled()
    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
  })

  it('même heure HH:MM mais jour suivant (last_slot = veille) → re-exécute', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusLastSlot: '2026-07-12 11:30' })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', '2026-07-12 11:30')
    expect(repo.insertGeneratedStatuses).toHaveBeenCalledTimes(1)
  })

  it('claim perdu (retourne false) → pas de génération ni bump', async () => {
    const repo = makeRepo({ claimSlot: vi.fn().mockResolvedValue(false) })
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
    expect(repo.bumpCursor).not.toHaveBeenCalled()
  })

  it('deux créneaux dus dans le même tick → SEUL le plus récent est traité (pas de rattrapage)', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusTimes: ['08:00', '11:30'] })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.claimSlot).toHaveBeenCalledTimes(1)
    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', null)
    expect(repo.insertGeneratedStatuses).toHaveBeenCalledTimes(1)
  })

  it('RÉGRESSION revue : dernier créneau déjà exécuté → le créneau plus ancien ne re-déclenche JAMAIS', async () => {
    // Bug d'origine : last_slot = "… 11:30" ≠ "… 08:00" → 08:00 re-partait à chaque
    // tick jusqu'à minuit. Le tri chronologique du format YYYY-MM-DD HH:MM garantit
    // désormais slotKey <= lastSlot pour tout créneau passé.
    const repo = makeRepo({}, [
      candidate({ autoStatusTimes: ['08:00', '11:30'], autoStatusLastSlot: '2026-07-13 11:30' }),
    ])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.claimSlot).not.toHaveBeenCalled()
    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
  })

  it('premier créneau exécuté, deuxième atteint → seul le deuxième part', async () => {
    const repo = makeRepo({}, [
      candidate({ autoStatusTimes: ['08:00', '11:30'], autoStatusLastSlot: '2026-07-13 08:00' }),
    ])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.claimSlot).toHaveBeenCalledTimes(1)
    expect(repo.claimSlot).toHaveBeenCalledWith('r1', '2026-07-13 11:30', '2026-07-13 08:00')
  })
})

describe('runAutoStatusOnce — rotation et quota', () => {
  it('respecte auto_status_count : génère exactement N statuts', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusCount: 2 })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    const rows = repo.insertGeneratedStatuses.mock.calls[0][0] as NewAutoStatusRow[]
    expect(rows).toHaveLength(2)
    expect(rows[0].mediaUrl).toBe('https://x/d1.jpg')
    expect(rows[1].mediaUrl).toBe('https://x/d2.jpg')
  })

  it('rotation : repart du cursor et boucle sans répéter deux fois d\'affilée', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusCursor: 2, autoStatusCount: 3 })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    const rows = repo.insertGeneratedStatuses.mock.calls[0][0] as NewAutoStatusRow[]
    // cursor=2 sur 3 plats : d3 (idx2), d1 (idx0), d2 (idx1) — aucune répétition adjacente.
    expect(rows.map((r) => r.mediaUrl)).toEqual(['https://x/d3.jpg', 'https://x/d1.jpg', 'https://x/d2.jpg'])
    expect(repo.bumpCursor).toHaveBeenCalledWith('r1', 2) // (2+3) % 3 = 2
  })

  it('0 plat disponible avec photo → skip silencieux (log), pas de génération ni bump', async () => {
    const repo = makeRepo({ getPhotoDishes: vi.fn().mockResolvedValue([]) })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.insertGeneratedStatuses).not.toHaveBeenCalled()
    expect(repo.bumpCursor).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[auto-status]'))
    logSpy.mockRestore()
  })

  it('gabarit de légende varie avec cursor + i (au moins deux gabarits différents sur 3 plats)', async () => {
    const repo = makeRepo({}, [candidate({ autoStatusCount: 3 })])
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

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
    await runAutoStatusOnce({ repo, now: () => NOW_1135_LIBREVILLE })

    expect(repo.claimSlot).toHaveBeenCalledTimes(1)
    expect(repo.claimSlot).toHaveBeenCalledWith('r-due', '2026-07-13 11:30', null)
  })
})
