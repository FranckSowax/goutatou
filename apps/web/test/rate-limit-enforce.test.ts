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

  it('fail-open si la DB renvoie une erreur (défaut)', async () => {
    const db = dbReturning([{ error: new Error('db down') }])
    expect(await enforceRateLimit(db, rules)).toEqual({ ok: true })
    // fail-open = la règle est ignorée, les suivantes sont quand même évaluées
    expect(db.rpc).toHaveBeenCalledTimes(3)
  })

  it("fail-open explicite avec onError: 'allow'", async () => {
    const db = dbReturning([{ error: new Error('db down') }])
    expect(await enforceRateLimit(db, rules, { onError: 'allow' })).toEqual({ ok: true })
  })

  it("fail-closed avec onError: 'deny' : erreur DB = limite atteinte", async () => {
    const db = dbReturning([{ error: new Error('db down') }])
    expect(await enforceRateLimit(db, rules, { onError: 'deny' })).toEqual({
      ok: false,
      retryAfter: rules[0].windowSeconds,
    })
    // court-circuite : aucune règle suivante n'est évaluée
    expect(db.rpc).toHaveBeenCalledTimes(1)
  })

  it("fail-closed : data vide (sans erreur) est aussi traité comme un échec en 'deny'", async () => {
    const db = { rpc: vi.fn(async () => ({ data: [], error: null })) }
    expect(await enforceRateLimit(db, rules, { onError: 'deny' })).toEqual({
      ok: false,
      retryAfter: rules[0].windowSeconds,
    })
  })

  it("onError: 'deny' ne change rien quand la DB répond normalement", async () => {
    const db = dbReturning([
      { allowed: true, retry_after: 0 },
      { allowed: true, retry_after: 0 },
      { allowed: true, retry_after: 0 },
    ])
    expect(await enforceRateLimit(db, rules, { onError: 'deny' })).toEqual({ ok: true })
  })

  it("onError: 'deny' renvoie le retry_after réel quand la limite est vraiment atteinte", async () => {
    const db = dbReturning([{ allowed: false, retry_after: 120 }])
    expect(await enforceRateLimit(db, rules, { onError: 'deny' })).toEqual({ ok: false, retryAfter: 120 })
  })
})
