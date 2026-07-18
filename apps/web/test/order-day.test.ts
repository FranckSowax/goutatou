import { describe, it, expect } from 'vitest'
import { dayBoundsUtc, shiftDay, isValidYmd, formatDayLabel } from '../src/lib/order-day'

describe('dayBoundsUtc', () => {
  it('borne un jour civil de Libreville en UTC (UTC+1)', () => {
    const { startUtc, endUtc } = dayBoundsUtc('2026-07-17')
    expect(startUtc).toBe('2026-07-16T23:00:00.000Z')
    expect(endUtc).toBe('2026-07-17T23:00:00.000Z')
  })
})

describe('shiftDay', () => {
  it('recule d’un jour', () => {
    expect(shiftDay('2026-07-17', -1)).toBe('2026-07-16')
  })
  it('avance d’un jour', () => {
    expect(shiftDay('2026-07-17', 1)).toBe('2026-07-18')
  })
  it('franchit un changement de mois', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('isValidYmd', () => {
  it('accepte un jour valide', () => {
    expect(isValidYmd('2026-07-17')).toBe(true)
  })
  it('rejette le vide, un format faux, une date impossible', () => {
    expect(isValidYmd(undefined)).toBe(false)
    expect(isValidYmd('17/07/2026')).toBe(false)
    expect(isValidYmd('2026-13-40')).toBe(false)
  })
})

describe('formatDayLabel', () => {
  it('rend un libellé FR jour + mois', () => {
    expect(formatDayLabel('2026-07-17')).toContain('17')
    expect(formatDayLabel('2026-07-17').toLowerCase()).toContain('juillet')
  })
})
