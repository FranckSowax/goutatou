import { describe, expect, it } from 'vitest'
import { campaignProgress } from '../src/types.js'

describe('campaignProgress', () => {
  it('calcule pending = total - sent - failed', () => {
    expect(campaignProgress(100, 30, 5)).toEqual({ total: 100, sent: 30, failed: 5, pending: 65 })
  })
  it('pending ne descend jamais sous 0', () => {
    expect(campaignProgress(10, 8, 5).pending).toBe(0)
  })
})
