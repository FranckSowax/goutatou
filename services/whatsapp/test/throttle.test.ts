import { describe, expect, it } from 'vitest'
import { nextSendDelayMs } from '../src/campaigns/throttle.js'

describe('nextSendDelayMs', () => {
  it('reste dans les bornes', () => {
    expect(nextSendDelayMs(4000, 8000, () => 0)).toBe(4000)
    expect(nextSendDelayMs(4000, 8000, () => 0.999999)).toBeLessThanOrEqual(8000)
    expect(nextSendDelayMs(4000, 8000, () => 0.5)).toBe(6000)
  })
  it('borne inférieure si min >= max', () => {
    expect(nextSendDelayMs(5000, 5000, () => 0.7)).toBe(5000)
  })
})
