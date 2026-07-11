import { writeFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { processOne, runLpFramesTick, type LpFramesWorkerDeps } from '../src/lpframes/worker.js'
import type { LpFramesCandidate, LpFramesRepo } from '../src/lpframes/repo.js'

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
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl }

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
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl }

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
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl }

    await expect(processOne(candidate, deps)).resolves.toBeUndefined()

    expect(runFfmpeg).not.toHaveBeenCalled()
    const setFramesCalls = (repo.setFrames as ReturnType<typeof vi.fn>).mock.calls
    expect(setFramesCalls[1][1]).toMatchObject({ status: 'failed', sourceUrl: candidate.mediaUrl })
  })

  it('aucune frame produite → failed', async () => {
    const repo = makeRepo()
    const fetchImpl = makeFetch()
    const runFfmpeg = makeSucceedingFfmpeg(0)
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl }

    await processOne(candidate, deps)

    const setFramesCalls = (repo.setFrames as ReturnType<typeof vi.fn>).mock.calls
    expect(setFramesCalls[1][1]).toMatchObject({ status: 'failed' })
  })
})

describe('runLpFramesTick', () => {
  it('aucun candidat → no-op', async () => {
    const repo = makeRepo({ listCandidates: vi.fn().mockResolvedValue([]) })
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg: vi.fn(), fetchImpl: makeFetch() }

    await runLpFramesTick(deps)

    expect(repo.setFrames).not.toHaveBeenCalled()
    expect(repo.uploadFrame).not.toHaveBeenCalled()
  })

  it('un candidat → traite via processOne', async () => {
    const repo = makeRepo({ listCandidates: vi.fn().mockResolvedValue([candidate]) })
    const runFfmpeg = makeSucceedingFfmpeg(1)
    const deps: LpFramesWorkerDeps = { repo, runFfmpeg, fetchImpl: makeFetch() }

    await runLpFramesTick(deps)

    expect(repo.setFrames).toHaveBeenCalledTimes(2)
    expect(repo.uploadFrame).toHaveBeenCalledTimes(1)
  })
})
