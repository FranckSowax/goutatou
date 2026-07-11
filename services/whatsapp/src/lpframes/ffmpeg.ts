import { createHash } from 'node:crypto'

export function sourceHash(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 12)
}

export function frameName(i: number): string {
  return `f-${String(i).padStart(4, '0')}.webp`
}

export function buildFfmpegArgs(input: string, outDir: string): string[] {
  return [
    '-y',
    '-i',
    input,
    '-vf',
    'fps=6,scale=960:-2',
    '-c:v',
    'libwebp',
    '-quality',
    '70',
    `${outDir}/f-%04d.webp`,
  ]
}

export interface LpFramesRecord {
  status: string
  sourceUrl: string
}

export interface NeedsExtractionInput {
  mediaType: string
  mediaUrl: string | null
  frames: LpFramesRecord | null
}

export function needsExtraction(cfg: NeedsExtractionInput): boolean {
  if (cfg.mediaType !== 'video') return false
  if (cfg.mediaUrl === null) return false
  if (cfg.frames === null) return true
  return cfg.frames.sourceUrl !== cfg.mediaUrl
}
