import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildFfmpegArgs, frameName, sourceHash } from './ffmpeg.js'
import type { LpFrames, LpFramesCandidate, LpFramesRepo } from './repo.js'

export type RunFfmpeg = (args: string[]) => Promise<{ stderr: string }>

const STDERR_TAIL = 300

/** spawn('ffmpeg', args) promisifié : rejette avec la fin du stderr en cas de code non-zéro. */
export function createFfmpegRunner(): RunFfmpeg {
  return (args) => new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args)
    let stderr = ''
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', (err) => reject(err))
    proc.on('close', (code) => {
      if (code === 0) resolve({ stderr })
      else reject(new Error(stderr.slice(-STDERR_TAIL)))
    })
  })
}

export interface LpFramesWorkerDeps {
  repo: LpFramesRepo
  runFfmpeg: RunFfmpeg
  fetchImpl?: typeof fetch
  /**
   * Garde SSRF : seule une mediaUrl commençant par ce préfixe (le dossier
   * public du bucket lp-media) sera fetchée. Toute autre origine — y compris
   * une URL absolue arbitraire injectée dans lp_config.hero.mediaUrl — est
   * refusée sans requête réseau.
   */
  allowedMediaPrefix: string
}

/** Extrait la hauteur produite depuis le stderr ffmpeg (ex. "960x540"). 0 si non capturable. */
function probeHeight(stderr: string): number {
  const matches = [...stderr.matchAll(/960x(\d{2,5})/g)]
  if (matches.length === 0) return 0
  const height = Number(matches[matches.length - 1][1])
  return Number.isFinite(height) && height > 0 ? height : 0
}

const PENDING_FRAMES = (sourceUrl: string): LpFrames => ({
  status: 'pending', sourceUrl, baseUrl: '', count: 0, width: 0, height: 0,
})
const FAILED_FRAMES = (sourceUrl: string): LpFrames => ({
  status: 'failed', sourceUrl, baseUrl: '', count: 0, width: 0, height: 0,
})

export async function processOne(candidate: LpFramesCandidate, deps: LpFramesWorkerDeps): Promise<void> {
  const { repo, runFfmpeg, allowedMediaPrefix } = deps
  const fetchFn = deps.fetchImpl ?? fetch
  const sourceUrl = candidate.mediaUrl

  if (!sourceUrl.startsWith(allowedMediaPrefix)) {
    console.error('[lpframes-worker]', candidate.restaurantId, `mediaUrl hors origine autorisée (SSRF guard) : ${sourceUrl}`)
    await repo.setFrames(candidate.restaurantId, FAILED_FRAMES(sourceUrl))
    return
  }

  await repo.setFrames(candidate.restaurantId, PENDING_FRAMES(sourceUrl))

  let tmpDir: string | null = null
  try {
    const res = await fetchFn(sourceUrl)
    if (!res.ok) throw new Error(`téléchargement échoué : ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    tmpDir = await mkdtemp(join(tmpdir(), 'lpframes-'))
    const inputPath = join(tmpDir, 'input.mp4')
    await writeFile(inputPath, buffer)

    const outDir = join(tmpDir, 'out')
    await mkdir(outDir, { recursive: true })

    const { stderr } = await runFfmpeg(buildFfmpegArgs(inputPath, outDir))

    const produced = (await readdir(outDir)).filter((f) => f.endsWith('.webp')).sort()
    if (produced.length === 0) throw new Error('aucune frame produite par ffmpeg')

    const hash = sourceHash(sourceUrl)
    const framesDir = `${candidate.restaurantId}/frames/${hash}`
    for (let i = 0; i < produced.length; i++) {
      const data = await readFile(join(outDir, produced[i]))
      await repo.uploadFrame(`${framesDir}/${frameName(i + 1)}`, data)
    }

    const baseUrl = repo.publicUrl(`${framesDir}/`)
    await repo.setFrames(candidate.restaurantId, {
      status: 'ready',
      sourceUrl,
      baseUrl,
      count: produced.length,
      width: 960,
      height: probeHeight(stderr),
    })
  } catch (err) {
    console.error('[lpframes-worker]', candidate.restaurantId, err)
    // Même sourceUrl qu'à l'entrée : anti-boucle, needsExtraction() ne re-sélectionnera
    // pas ce candidat tant que la source ne change pas.
    await repo.setFrames(candidate.restaurantId, FAILED_FRAMES(sourceUrl))
  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}

export async function runLpFramesTick(deps: LpFramesWorkerDeps): Promise<void> {
  const candidates = await deps.repo.listCandidates()
  for (const candidate of candidates) {
    await processOne(candidate, deps)
  }
}

export function startLpFramesWorker(deps: LpFramesWorkerDeps & { pollMs: number }): void {
  const tick = async () => {
    try {
      await runLpFramesTick(deps)
    } catch (err) {
      console.error('[lpframes-worker]', err)
    } finally {
      setTimeout(tick, deps.pollMs)
    }
  }
  console.log('[lpframes-worker] démarré')
  setTimeout(tick, deps.pollMs)
}
