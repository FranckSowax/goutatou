import { describe, expect, it } from 'vitest'
import { checkEligibility } from '../src/lib/wheel-eligibility'

const DAY_MS = 24 * 60 * 60 * 1000

describe('checkEligibility', () => {
  it('jamais tourné (lastSpinAt null) -> éligible', () => {
    const result = checkEligibility(null, 30, new Date('2026-07-15T00:00:00Z'))
    expect(result).toEqual({ eligible: true })
  })

  it('dernier tour il y a 10 jours avec period=30 -> bloqué, nextEligibleAt = lastSpinAt+30j', () => {
    const now = new Date('2026-07-15T00:00:00Z')
    const lastSpinAt = new Date(now.getTime() - 10 * DAY_MS)
    const result = checkEligibility(lastSpinAt, 30, now)
    expect(result.eligible).toBe(false)
    if (!result.eligible) {
      expect(result.nextEligibleAt.getTime()).toBe(lastSpinAt.getTime() + 30 * DAY_MS)
    }
  })

  it('dernier tour il y a 40 jours avec period=30 -> éligible', () => {
    const now = new Date('2026-07-15T00:00:00Z')
    const lastSpinAt = new Date(now.getTime() - 40 * DAY_MS)
    const result = checkEligibility(lastSpinAt, 30, now)
    expect(result).toEqual({ eligible: true })
  })

  it('periodDays=0 -> toujours éligible, même avec un tour récent', () => {
    const now = new Date('2026-07-15T00:00:00Z')
    const lastSpinAt = new Date(now.getTime() - DAY_MS)
    const result = checkEligibility(lastSpinAt, 0, now)
    expect(result).toEqual({ eligible: true })
  })
})
