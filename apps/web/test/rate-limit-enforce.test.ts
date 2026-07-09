import { describe, expect, it, vi } from 'vitest'
import { enforceRateLimit, orderRateKeys, type RateRule } from '../src/lib/rate-limit'

function dbReturning(seq: Array<{ allowed: boolean; retry_after: number } | { error: unknown }>) {
  let i = 0
  return {
    rpc: vi.fn(async () => {
      const step = seq[i++]
      if (step && 'error' in step) return { data: null, error: step.error }
      return { data: [step], error: null }
    }),
  }
}
const rules: RateRule[] = orderRateKeys('s', '241770001', '1.2.3.4')

describe('enforceRateLimit', () => {
  it('ok quand toutes les couches passent', async () => {
    const db = dbReturning([
      { allowed: true, retry_after: 0 },
      { allowed: true, retry_after: 0 },
      { allowed: true, retry_after: 0 },
    ])
    expect(await enforceRateLimit(db, rules)).toEqual({ ok: true })
    expect(db.rpc).toHaveBeenCalledTimes(3)
  })

  it('bloque et court-circuite au 1er dépassement', async () => {
    const db = dbReturning([
      { allowed: true, retry_after: 0 },
      { allowed: false, retry_after: 42 },
    ])
    expect(await enforceRateLimit(db, rules)).toEqual({ ok: false, retryAfter: 42 })
    expect(db.rpc).toHaveBeenCalledTimes(2) // n'appelle pas la 3e règle
  })

  it('fail-open si la DB renvoie une erreur', async () => {
    const db = dbReturning([{ error: new Error('db down') }])
    expect(await enforceRateLimit(db, rules)).toEqual({ ok: true })
  })
})
