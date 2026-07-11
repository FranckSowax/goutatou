import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildFfmpegArgs, frameName, needsExtraction, sourceHash } from '../src/lpframes/ffmpeg.js'

describe('sourceHash', () => {
  it('retourne un hash sha256 hexadécimal tronqué à 12 caractères', () => {
    const url = 'https://example.com/video.mp4'
    const hash = sourceHash(url)
    expect(hash).toHaveLength(12)
    expect(hash).toMatch(/^[0-9a-f]{12}$/)
  })

  it('est stable pour la même url', () => {
    const url = 'https://example.com/video.mp4'
    expect(sourceHash(url)).toBe(sourceHash(url))
  })

  it('correspond aux 12 premiers caractères du sha256 hex complet', () => {
    const url = 'https://example.com/video.mp4'
    const full = createHash('sha256').update(url).digest('hex')
    expect(sourceHash(url)).toBe(full.slice(0, 12))
  })

  it('diffère pour des urls différentes', () => {
    expect(sourceHash('https://example.com/a.mp4')).not.toBe(sourceHash('https://example.com/b.mp4'))
  })
})

describe('frameName', () => {
  it('formate en 1-based avec padding 4', () => {
    expect(frameName(1)).toBe('f-0001.webp')
  })

  it('gère les nombres à 2-3 chiffres', () => {
    expect(frameName(42)).toBe('f-0042.webp')
    expect(frameName(999)).toBe('f-0999.webp')
  })

  it('ne tronque pas au-delà de 4 chiffres', () => {
    expect(frameName(1234)).toBe('f-1234.webp')
  })
})

describe('buildFfmpegArgs', () => {
  it('construit exactement les arguments attendus', () => {
    const args = buildFfmpegArgs('/tmp/input.mp4', '/tmp/out')
    expect(args).toEqual([
      '-y',
      '-i',
      '/tmp/input.mp4',
      '-vf',
      'fps=6,scale=960:-2',
      '-c:v',
      'libwebp',
      '-quality',
      '70',
      '/tmp/out/f-%04d.webp',
    ])
  })
})

describe('needsExtraction', () => {
  const VIDEO_URL = 'https://x.com/a.mp4'
  const OTHER_URL = 'https://x.com/b.mp4'

  it('false pour un mediaType image (même avec une url)', () => {
    expect(
      needsExtraction({ mediaType: 'image', mediaUrl: VIDEO_URL, frames: null }),
    ).toBe(false)
  })

  it('false quand mediaUrl est null, même pour une vidéo', () => {
    expect(
      needsExtraction({ mediaType: 'video', mediaUrl: null, frames: null }),
    ).toBe(false)
  })

  it('true pour une vidéo sans frames existants', () => {
    expect(
      needsExtraction({ mediaType: 'video', mediaUrl: VIDEO_URL, frames: null }),
    ).toBe(true)
  })

  it('false quand frames ready sur la même source', () => {
    expect(
      needsExtraction({
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
        frames: { status: 'ready', sourceUrl: VIDEO_URL },
      }),
    ).toBe(false)
  })

  it('true quand frames ready mais sur une autre source', () => {
    expect(
      needsExtraction({
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
        frames: { status: 'ready', sourceUrl: OTHER_URL },
      }),
    ).toBe(true)
  })

  it('false quand frames failed sur la même source (pas de retry loop)', () => {
    expect(
      needsExtraction({
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
        frames: { status: 'failed', sourceUrl: VIDEO_URL },
      }),
    ).toBe(false)
  })

  it('true quand frames failed mais sur une autre source', () => {
    expect(
      needsExtraction({
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
        frames: { status: 'failed', sourceUrl: OTHER_URL },
      }),
    ).toBe(true)
  })

  it('true quand frames pending sur la même source (ticks séquentiels → forcément périmé)', () => {
    expect(
      needsExtraction({
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
        frames: { status: 'pending', sourceUrl: VIDEO_URL },
      }),
    ).toBe(true)
  })

  it('true quand frames pending mais sur une autre source', () => {
    expect(
      needsExtraction({
        mediaType: 'video',
        mediaUrl: VIDEO_URL,
        frames: { status: 'pending', sourceUrl: OTHER_URL },
      }),
    ).toBe(true)
  })
})
