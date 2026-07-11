import { writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { processOne, runLpFramesTick, type LpFramesWorkerDeps } from '../src/lpframes/worker.js'
import { createLpFramesRepo } from '../src/lpframes/repo.js'
import type { LpFramesCandidate, LpFramesRepo } from '../src/lpframes/repo.js'
import type { SupabaseClient } from '@supabase/supabase-js'

const ALLOWED_MEDIA_PREFIX = 'https://example.com/'

const candidate: LpFramesCandidate = {
  restaurantId: 'r1',
  mediaUrl: 'https://example.com/video.mp4',
  lpConfig: {},
}

function makeRepo(over: Partial<LpFramesRepo> = {}): LpFramesRepo {
  return {
    listCandidates: vi.fn().mockResolvedValue([]),
    setFrames: vi.fn().mockResolvedValue(undefined),
    uploadFrame: vi.fn().mockResolvedValue(undefined),
    publicUrl: vi.fn((path: string) => `https://cdn.test/lp-media/${path}`),
    ...over,
  }
}

/**
 * Stub minimal du client Supabase pour tester createLpFramesRepo().setFrames
 * en isolation : reproduit la chaîne `.from().select().eq().single()` (lecture)
 * et `.from().update().eq()` (écriture), avec des réponses configurables.
 */
function makeSupabaseStub(opts: {
  selectResult: { data: unknown; error: { message: string } | null }
  updateResult?: { error: { message: string } | null }
}) {
  const single = vi.fn().mockResolvedValue(opts.selectResult)
  const selectEq = vi.fn().mockReturnValue({ single })
  const select = vi.fn().mockReturnValue({ eq: selectEq })
  const updateEq = vi.fn().mockResolvedValue(opts.updateResult ?? { error: null })
  const update = vi.fn().mockReturnValue({ eq: updateEq })
  const from = vi.fn().mockReturnValue({ select, update })
  return { db: { from } as unknown as SupabaseClient, from, select, update, updateEq }
}

function makeFetch(ok = true) {
  return vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 404,
    arrayBuffer: async () => new TextEncoder().encode('fake-video-bytes').buffer,
  }) as unknown as typeof fetch
}

/** Simule ffmpeg : écrit N fichiers webp dans le outDir extrait des args reçus. */
function makeSucceedingFfmpeg(fileCount: number, stderr = 'Stream #0:0: Video: libwebp, yuv420p, 960x540, q=2-31, 6 fps') {
  return vi.fn().mockImplementation(async (args: string[]) => {
    const outPattern = args[args.length - 1]
    const outDir = outPattern.replace(/\/f-%04d\.webp$/, '')
    for (let i = 1; i <= fileCount; i++) {
      const name = `f-${String(i).padStart(4, '0')}.webp`
      await writeFile(`${outDir}/${name}`, Buffer.from(`frame-${i}`))
    }
    return { stderr }
  })
}

describe('processOne', () => {
  it('candidat vidéo → pending puis ready avec count/paths corrects', async () => {
    const repo = makeRepo()
    const fetchImpl = makeFetch()
    const runFfmpeg = makeSucceedingFfmpeg(3)
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl, allowedMediaPrefix: ALLOWED_MEDIA_PREFIX }

    await processOne(candidate, deps)

    const setFramesCalls = (repo.setFrames as ReturnType<typeof vi.fn>).mock.calls
    expect(setFramesCalls).toHaveLength(2)
    expect(setFramesCalls[0]).toEqual(['r1', expect.objectContaining({ status: 'pending', sourceUrl: candidate.mediaUrl })])

    const [restaurantId, frames] = setFramesCalls[1]
    expect(restaurantId).toBe('r1')
    expect(frames).toMatchObject({
      status: 'ready',
      sourceUrl: candidate.mediaUrl,
      count: 3,
      width: 960,
      height: 540,
    })
    expect(frames.baseUrl).toContain('r1/frames/')
    expect(frames.baseUrl.endsWith('/')).toBe(true)

    expect(repo.uploadFrame).toHaveBeenCalledTimes(3)
    const uploadCalls = (repo.uploadFrame as ReturnType<typeof vi.fn>).mock.calls
    expect(uploadCalls[0][0]).toMatch(/^r1\/frames\/[0-9a-f]{12}\/f-0001\.webp$/)
    expect(uploadCalls[0][1]).toBeInstanceOf(Buffer)
  })

  it('échec ffmpeg → failed sans throw, avec la même sourceUrl (anti-boucle)', async () => {
    const repo = makeRepo()
    const fetchImpl = makeFetch()
    const runFfmpeg = vi.fn().mockRejectedValue(new Error('ffmpeg exit 1: invalid data'))
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl, allowedMediaPrefix: ALLOWED_MEDIA_PREFIX }

    await expect(processOne(candidate, deps)).resolves.toBeUndefined()

    const setFramesCalls = (repo.setFrames as ReturnType<typeof vi.fn>).mock.calls
    expect(setFramesCalls[0][1].status).toBe('pending')
    expect(setFramesCalls[1][1]).toMatchObject({ status: 'failed', sourceUrl: candidate.mediaUrl })
    expect(repo.uploadFrame).not.toHaveBeenCalled()
  })

  it('échec téléchargement → failed sans throw', async () => {
    const repo = makeRepo()
    const fetchImpl = makeFetch(false)
    const runFfmpeg = vi.fn()
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl, allowedMediaPrefix: ALLOWED_MEDIA_PREFIX }

    await expect(processOne(candidate, deps)).resolves.toBeUndefined()

    expect(runFfmpeg).not.toHaveBeenCalled()
    const setFramesCalls = (repo.setFrames as ReturnType<typeof vi.fn>).mock.calls
    expect(setFramesCalls[1][1]).toMatchObject({ status: 'failed', sourceUrl: candidate.mediaUrl })
  })

  it('aucune frame produite → failed', async () => {
    const repo = makeRepo()
    const fetchImpl = makeFetch()
    const runFfmpeg = makeSucceedingFfmpeg(0)
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl, allowedMediaPrefix: ALLOWED_MEDIA_PREFIX }

    await processOne(candidate, deps)

    const setFramesCalls = (repo.setFrames as ReturnType<typeof vi.fn>).mock.calls
    expect(setFramesCalls[1][1]).toMatchObject({ status: 'failed' })
  })

  it('mediaUrl hors du bucket autorisé (garde SSRF) → failed direct, fetch jamais appelé', async () => {
    const repo = makeRepo()
    const fetchImpl = makeFetch()
    const runFfmpeg = vi.fn()
    const rogueCandidate: LpFramesCandidate = {
      restaurantId: 'r1',
      mediaUrl: 'https://attacker.example/internal-metadata',
      lpConfig: {},
    }
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl, allowedMediaPrefix: ALLOWED_MEDIA_PREFIX }

    await expect(processOne(rogueCandidate, deps)).resolves.toBeUndefined()

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(runFfmpeg).not.toHaveBeenCalled()
    const setFramesCalls = (repo.setFrames as ReturnType<typeof vi.fn>).mock.calls
    expect(setFramesCalls).toHaveLength(1)
    expect(setFramesCalls[0]).toEqual(['r1', expect.objectContaining({ status: 'failed', sourceUrl: rogueCandidate.mediaUrl })])
  })
})

describe('createLpFramesRepo — setFrames', () => {
  it('relecture lp_config en échec (error) → throw, update jamais appelé', async () => {
    const stub = makeSupabaseStub({ selectResult: { data: null, error: { message: 'network blip' } } })
    const repo = createLpFramesRepo(stub.db)

    await expect(
      repo.setFrames('r1', { status: 'ready', sourceUrl: 'https://example.com/v.mp4', baseUrl: '', count: 1, width: 1, height: 1 }),
    ).rejects.toThrow(/relecture lp_config échouée/)

    expect(stub.update).not.toHaveBeenCalled()
    expect(stub.updateEq).not.toHaveBeenCalled()
  })

  it('relecture sans error mais data=null → throw aussi, update jamais appelé', async () => {
    const stub = makeSupabaseStub({ selectResult: { data: null, error: null } })
    const repo = createLpFramesRepo(stub.db)

    await expect(
      repo.setFrames('r1', { status: 'ready', sourceUrl: 'https://example.com/v.mp4', baseUrl: '', count: 1, width: 1, height: 1 }),
    ).rejects.toThrow(/relecture lp_config échouée/)

    expect(stub.update).not.toHaveBeenCalled()
  })

  it('update en échec → throw (symétrique à la lecture)', async () => {
    const stub = makeSupabaseStub({
      selectResult: { data: { lp_config: { hero: { mediaType: 'video' } } }, error: null },
      updateResult: { error: { message: 'write conflict' } },
    })
    const repo = createLpFramesRepo(stub.db)

    await expect(
      repo.setFrames('r1', { status: 'ready', sourceUrl: 'https://example.com/v.mp4', baseUrl: '', count: 1, width: 1, height: 1 }),
    ).rejects.toThrow(/mise à jour lp_config échouée/)
  })

  it('lecture et update ok → merge hero.frames sans écraser le reste de lp_config', async () => {
    const stub = makeSupabaseStub({
      selectResult: {
        data: { lp_config: { hero: { mediaType: 'video', mediaUrl: 'https://example.com/v.mp4' }, other: 'kept' } },
        error: null,
      },
    })
    const repo = createLpFramesRepo(stub.db)
    const frames = { status: 'ready' as const, sourceUrl: 'https://example.com/v.mp4', baseUrl: 'https://cdn/x/', count: 2, width: 960, height: 540 }

    await repo.setFrames('r1', frames)

    expect(stub.update).toHaveBeenCalledWith({
      lp_config: {
        other: 'kept',
        hero: { mediaType: 'video', mediaUrl: 'https://example.com/v.mp4', frames },
      },
    })
    expect(stub.updateEq).toHaveBeenCalledWith('id', 'r1')
  })
})

describe('runLpFramesTick', () => {
  it('aucun candidat → no-op', async () => {
    const repo = makeRepo({ listCandidates: vi.fn().mockResolvedValue([]) })
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg: vi.fn(), fetchImpl: makeFetch(), allowedMediaPrefix: ALLOWED_MEDIA_PREFIX }

    await runLpFramesTick(deps)

    expect(repo.setFrames).not.toHaveBeenCalled()
    expect(repo.uploadFrame).not.toHaveBeenCalled()
  })

  it('un candidat → traite via processOne', async () => {
    const repo = makeRepo({ listCandidates: vi.fn().mockResolvedValue([candidate]) })
    const runFfmpeg = makeSucceedingFfmpeg(1)
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl: makeFetch(), allowedMediaPrefix: ALLOWED_MEDIA_PREFIX }

    await runLpFramesTick(deps)

    expect(repo.setFrames).toHaveBeenCalledTimes(2)
    expect(repo.uploadFrame).toHaveBeenCalledTimes(1)
  })
})
