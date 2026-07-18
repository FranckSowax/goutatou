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

describe('periodBounds — jour', () => {
  it('borne le jour civil courant et la veille (Libreville UTC+1)', () => {
    // 2026-07-17 13:00 Libreville
    const now = new Date('2026-07-17T12:00:00Z')
    const b = periodBounds('day', now)
    expect(b.startYmd).toBe('2026-07-17')
    expect(b.endYmd).toBe('2026-07-17')
    expect(b.current.startUtc).toBe('2026-07-16T23:00:00.000Z')
    expect(b.current.endUtc).toBe('2026-07-17T23:00:00.000Z')
    // veille immédiatement contiguë
    expect(b.previous.endUtc).toBe(b.current.startUtc)
    expect(b.previous.startUtc).toBe('2026-07-15T23:00:00.000Z')
  })
})

describe('periodBounds — semaine', () => {
  it('semaine lundi→dimanche contenant le jour courant, précédente contiguë', () => {
    // 2026-07-17 est un vendredi → lundi de la semaine = 2026-07-13
    const now = new Date('2026-07-17T12:00:00Z')
    const b = periodBounds('week', now)
    expect(b.startYmd).toBe('2026-07-13')
    expect(b.endYmd).toBe('2026-07-19')
    expect(b.current.startUtc).toBe('2026-07-12T23:00:00.000Z') // lundi 13, minuit Libreville
    expect(b.current.endUtc).toBe('2026-07-19T23:00:00.000Z') // lundi 20, minuit Libreville
    expect(b.previous.startUtc).toBe('2026-07-05T23:00:00.000Z') // lundi 06
    expect(b.previous.endUtc).toBe(b.current.startUtc)
  })
})

describe('periodBounds — mois', () => {
  it('mois civil courant et mois précédent contigus', () => {
    const now = new Date('2026-07-17T12:00:00Z')
    const b = periodBounds('month', now)
    expect(b.startYmd).toBe('2026-07-01')
    expect(b.endYmd).toBe('2026-07-31')
    expect(b.current.startUtc).toBe('2026-06-30T23:00:00.000Z') // 1er juillet minuit Libreville
    expect(b.current.endUtc).toBe('2026-07-31T23:00:00.000Z') // 1er août minuit Libreville
    expect(b.previous.startUtc).toBe('2026-05-31T23:00:00.000Z') // 1er juin minuit Libreville
    expect(b.previous.endUtc).toBe(b.current.startUtc)
  })

  it('gère le passage d’année (janvier → décembre précédent)', () => {
    const now = new Date('2026-01-10T12:00:00Z')
    const b = periodBounds('month', now)
    expect(b.startYmd).toBe('2026-01-01')
    expect(b.previous.startUtc).toBe('2025-11-30T23:00:00.000Z') // 1er décembre 2025 minuit Libreville
  })
})
