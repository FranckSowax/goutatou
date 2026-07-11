import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, parseLpConfig } from '../src/lib/lp/config'

describe('parseLpConfig', () => {
  it('config vide → défauts sûrs, non publiée, titre = nom du resto', () => {
    const c = parseLpConfig({}, 'Chez Mama')
    expect(c.published).toBe(false)
    expect(c.hero.title).toBe('Chez Mama')
    expect(c.hero.mediaUrl).toBeNull()
    expect(c.theme).toEqual(DEFAULT_THEME)
    expect(c.featuredIds).toEqual([])
    expect(c.infos.hours).toEqual([])
  })

  it('published doit être strictement true', () => {
    expect(parseLpConfig({ published: 'true' }, 'X').published).toBe(false)
    expect(parseLpConfig({ published: 1 }, 'X').published).toBe(false)
    expect(parseLpConfig({ published: true }, 'X').published).toBe(true)
  })

  it('garde les valeurs valides et jette les invalides champ par champ', () => {
    const c = parseLpConfig({
      hero: { title: 'Le vrai goût', mediaUrl: 'https://x/img.jpg', mediaType: 'video' },
      theme: { primary: '#123456', font: 'serif', bg: 42 },
      featuredIds: ['a', 3, 'b'],
      infos: { hours: ['Lun-Sam 11h-22h'], address: 'Glass, Libreville' },
      whatsappPhone: '24177000001',
    }, 'Chez Mama')
    expect(c.hero.title).toBe('Le vrai goût')
    expect(c.hero.mediaType).toBe('video')
    expect(c.theme.primary).toBe('#123456')
    expect(c.theme.font).toBe('serif')
    expect(c.theme.bg).toBe(DEFAULT_THEME.bg) // invalide → défaut
    expect(c.featuredIds).toEqual(['a', 'b'])
    expect(c.infos.address).toBe('Glass, Libreville')
    expect(c.whatsappPhone).toBe('24177000001')
  })

  it('raw non-objet (null, string) → config par défaut', () => {
    expect(parseLpConfig(null, 'X').published).toBe(false)
    expect(parseLpConfig('junk', 'X').hero.title).toBe('X')
  })

  it('hero.frames absent → null', () => {
    const c = parseLpConfig({}, 'Chez Mama')
    expect(c.hero.frames).toBeNull()
  })

  it('hero.frames ready complet → objet', () => {
    const c = parseLpConfig({
      hero: {
        frames: {
          status: 'ready',
          sourceUrl: 'https://x/video.mp4',
          baseUrl: 'https://cdn/frames/',
          count: 90,
          width: 1920,
          height: 1080,
        },
      },
    }, 'Chez Mama')
    expect(c.hero.frames).toEqual({
      status: 'ready',
      sourceUrl: 'https://x/video.mp4',
      baseUrl: 'https://cdn/frames/',
      count: 90,
      width: 1920,
      height: 1080,
    })
  })

  it('hero.frames ready sans count → null', () => {
    const c = parseLpConfig({
      hero: {
        frames: {
          status: 'ready',
          sourceUrl: 'https://x/video.mp4',
          baseUrl: 'https://cdn/frames/',
          count: 0,
          width: 1920,
          height: 1080,
        },
      },
    }, 'Chez Mama')
    expect(c.hero.frames).toBeNull()
  })

  it('hero.frames pending minimal (status+sourceUrl) → objet avec baseUrl vide/count 0', () => {
    const c = parseLpConfig({
      hero: {
        frames: {
          status: 'pending',
          sourceUrl: 'https://x/video.mp4',
        },
      },
    }, 'Chez Mama')
    expect(c.hero.frames).toEqual({
      status: 'pending',
      sourceUrl: 'https://x/video.mp4',
      baseUrl: '',
      count: 0,
      width: 0,
      height: 0,
    })
  })

  it('hero.frames status inconnu → null', () => {
    const c = parseLpConfig({
      hero: {
        frames: {
          status: 'bogus',
          sourceUrl: 'https://x/video.mp4',
          baseUrl: 'https://cdn/frames/',
          count: 10,
          width: 100,
          height: 100,
        },
      },
    }, 'Chez Mama')
    expect(c.hero.frames).toBeNull()
  })
})
