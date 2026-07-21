import { describe, expect, it } from 'vitest'
import {
  MEDIA_COPY,
  MEDIA_REPLY_WINDOW_MS,
  createMediaThrottle,
  mediaLogBody,
  unsupportedMediaKind,
} from '../src/bot/media.js'

describe('unsupportedMediaKind', () => {
  it('note vocale (audio/voice/ptt) → kind "voice"', () => {
    expect(unsupportedMediaKind('audio')).toBe('voice')
    expect(unsupportedMediaKind('voice')).toBe('voice')
    expect(unsupportedMediaKind('ptt')).toBe('voice')
  })

  it('image/vidéo/sticker/document/gif → kind "media"', () => {
    for (const t of ['image', 'video', 'sticker', 'document', 'gif']) {
      expect(unsupportedMediaKind(t)).toBe('media')
    }
  })

  it('types DÉJÀ gérés par le bot → null (aucune réponse « je ne sais pas »)', () => {
    for (const t of ['text', 'location', 'order', 'reply']) {
      expect(unsupportedMediaKind(t)).toBeNull()
    }
  })

  it('types techniques/inconnus (system, action, …) → null (allowlist, jamais de bruit)', () => {
    for (const t of ['system', 'action', 'call_log', 'inconnu']) {
      expect(unsupportedMediaKind(t)).toBeNull()
    }
  })

  it('insensible à la casse', () => {
    expect(unsupportedMediaKind('PTT')).toBe('voice')
    expect(unsupportedMediaKind('Image')).toBe('media')
  })
})

describe('MEDIA_COPY', () => {
  it('vocal : ton chaleureux + les deux sorties actionnables (menu / humain)', () => {
    expect(MEDIA_COPY.voice).toContain('vocaux')
    expect(MEDIA_COPY.voice).toContain('*menu*')
    expect(MEDIA_COPY.voice).toContain('*humain*')
  })

  it('image/fichier : variante dédiée, mêmes sorties', () => {
    expect(MEDIA_COPY.media).not.toBe(MEDIA_COPY.voice)
    expect(MEDIA_COPY.media).toContain('*menu*')
    expect(MEDIA_COPY.media).toContain('*humain*')
  })
})

describe('mediaLogBody', () => {
  it('vocal → libellé lisible dans message_logs', () => {
    expect(mediaLogBody('ptt', 'voice')).toBe('🎤 Note vocale')
  })

  it('autre média → libellé avec le type brut Whapi (traçabilité)', () => {
    expect(mediaLogBody('image', 'media')).toBe('📎 Pièce jointe (image)')
  })
})

describe('createMediaThrottle', () => {
  it('première réception pour une clé → réponse autorisée', () => {
    const throttle = createMediaThrottle(60_000)
    expect(throttle.shouldReply('r1:chat1', 1_000)).toBe(true)
  })

  it('second média rapproché (même clé, dans la fenêtre) → PAS de seconde réponse', () => {
    const throttle = createMediaThrottle(60_000)
    expect(throttle.shouldReply('r1:chat1', 1_000)).toBe(true)
    expect(throttle.shouldReply('r1:chat1', 5_000)).toBe(false)
    expect(throttle.shouldReply('r1:chat1', 60_000)).toBe(false)
  })

  it('après la fenêtre → nouvelle réponse autorisée', () => {
    const throttle = createMediaThrottle(60_000)
    throttle.shouldReply('r1:chat1', 1_000)
    expect(throttle.shouldReply('r1:chat1', 61_001)).toBe(true)
  })

  it('clés indépendantes (autre client, autre resto) → jamais bloquées entre elles', () => {
    const throttle = createMediaThrottle(60_000)
    expect(throttle.shouldReply('r1:chat1', 1_000)).toBe(true)
    expect(throttle.shouldReply('r1:chat2', 1_000)).toBe(true)
    expect(throttle.shouldReply('r2:chat1', 1_000)).toBe(true)
  })

  it('les entrées expirées sont purgées (pas de fuite mémoire)', () => {
    const throttle = createMediaThrottle(60_000)
    throttle.shouldReply('r1:chat1', 1_000)
    throttle.shouldReply('r1:chat2', 1_000)
    expect(throttle.size()).toBe(2)
    throttle.shouldReply('r1:chat3', 500_000)
    expect(throttle.size()).toBe(1)
  })

  it('reset() vide l’état (isolation des tests)', () => {
    const throttle = createMediaThrottle(60_000)
    throttle.shouldReply('r1:chat1', 1_000)
    throttle.reset()
    expect(throttle.shouldReply('r1:chat1', 2_000)).toBe(true)
  })

  it('fenêtre par défaut du service : 10 minutes', () => {
    expect(MEDIA_REPLY_WINDOW_MS).toBe(10 * 60 * 1000)
  })
})
