import { describe, expect, it } from 'vitest'
import { conversionRate } from '../src/lib/stats'
import { periodBounds } from '../src/lib/analytics-period'

describe('conversionRate', () => {
  it('part des chats ayant écrit qui ont aussi commandé', () => {
    // 3 chats ont écrit (a, b, c), 2 d'entre eux ont commandé (a, b) → 67 %.
    expect(conversionRate(['a', 'b', 'c'], ['a', 'b'])).toBe(67)
  })

  it('déduplique les identifiants (chat_id répété = 1 interlocuteur)', () => {
    expect(conversionRate(['a', 'a', 'b'], ['a', 'a'])).toBe(50)
  })

  it('ignore les commandeurs qui n’ont jamais écrit (pas dans les writers)', () => {
    expect(conversionRate(['a'], ['a', 'z'])).toBe(100)
  })

  it('renvoie 0 si personne n’a écrit (pas de base)', () => {
    expect(conversionRate([], ['a', 'b'])).toBe(0)
  })

  it('renvoie 0 si aucun writer n’a commandé', () => {
    expect(conversionRate(['a', 'b'], ['z'])).toBe(0)
  })
})

describe('periodBounds — jour (dernière période complète = veille)', () => {
  it('borne la veille et l’avant-veille (Libreville UTC+1)', () => {
    // 2026-07-17 13:00 Libreville → veille = 2026-07-16
    const now = new Date('2026-07-17T12:00:00Z')
    const b = periodBounds('day', now)
    expect(b.startYmd).toBe('2026-07-16')
    expect(b.endYmd).toBe('2026-07-16')
    expect(b.current.startUtc).toBe('2026-07-15T23:00:00.000Z')
    expect(b.current.endUtc).toBe('2026-07-16T23:00:00.000Z')
    expect(b.previous.endUtc).toBe(b.current.startUtc)
    expect(b.previous.startUtc).toBe('2026-07-14T23:00:00.000Z')
  })
})

describe('periodBounds — semaine (dernière semaine complète)', () => {
  it('semaine lundi→dimanche précédente, et celle d’avant contiguë', () => {
    // 2026-07-17 vendredi → lundi courant = 2026-07-13 → semaine complète préc. = 06→12 juillet
    const now = new Date('2026-07-17T12:00:00Z')
    const b = periodBounds('week', now)
    expect(b.startYmd).toBe('2026-07-06')
    expect(b.endYmd).toBe('2026-07-12')
    expect(b.current.startUtc).toBe('2026-07-05T23:00:00.000Z') // lundi 06, minuit Libreville
    expect(b.current.endUtc).toBe('2026-07-12T23:00:00.000Z') // lundi 13, minuit Libreville
    expect(b.previous.startUtc).toBe('2026-06-28T23:00:00.000Z') // lundi 29 juin
    expect(b.previous.endUtc).toBe(b.current.startUtc)
  })
})

describe('periodBounds — mois (dernier mois complet)', () => {
  it('mois précédent et celui d’avant contigus', () => {
    const now = new Date('2026-07-17T12:00:00Z')
    const b = periodBounds('month', now)
    expect(b.startYmd).toBe('2026-06-01')
    expect(b.endYmd).toBe('2026-06-30')
    expect(b.current.startUtc).toBe('2026-05-31T23:00:00.000Z') // 1er juin minuit Libreville
    expect(b.current.endUtc).toBe('2026-06-30T23:00:00.000Z') // 1er juillet minuit Libreville
    expect(b.previous.startUtc).toBe('2026-04-30T23:00:00.000Z') // 1er mai minuit Libreville
    expect(b.previous.endUtc).toBe(b.current.startUtc)
  })

  it('gère le passage d’année (janvier → décembre précédent)', () => {
    const now = new Date('2026-01-10T12:00:00Z')
    const b = periodBounds('month', now)
    expect(b.startYmd).toBe('2025-12-01')
    expect(b.current.startUtc).toBe('2025-11-30T23:00:00.000Z') // 1er décembre 2025 minuit Libreville
    expect(b.previous.startUtc).toBe('2025-10-31T23:00:00.000Z') // 1er novembre 2025 minuit Libreville
  })
})
