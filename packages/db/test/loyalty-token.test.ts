import { describe, expect, it } from 'vitest'
import { signLoyaltyToken, verifyLoyaltyToken } from '../src/loyalty-token.js'

const SECRET = 'loyalty-secret-123'

describe('loyalty token', () => {
  it('signe puis vérifie à l’identique', () => {
    const t = signLoyaltyToken({ rid: 'r1', cid: 'c1', ttlSec: 3600 }, SECRET, 1000)
    expect(verifyLoyaltyToken(t, SECRET, 1500)).toEqual({ rid: 'r1', cid: 'c1', exp: 1000 + 3600 })
  })
  it('utilise un TTL long par défaut (carte permanente)', () => {
    const t = signLoyaltyToken({ rid: 'r1', cid: 'c1' }, SECRET, 1000)
    const claims = verifyLoyaltyToken(t, SECRET, 1000 + 5 * 365 * 24 * 3600)
    expect(claims?.cid).toBe('c1')
  })
  it('rejette une signature falsifiée ou un mauvais secret', () => {
    const t = signLoyaltyToken({ rid: 'r1', cid: 'c1' }, SECRET, 1000)
    expect(verifyLoyaltyToken(t, 'mauvais', 1500)).toBeNull()
    expect(verifyLoyaltyToken(t.slice(0, -3) + 'xxx', SECRET, 1500)).toBeNull()
    expect(verifyLoyaltyToken('nimportequoi', SECRET, 1500)).toBeNull()
  })
  it('rejette un token expiré', () => {
    const t = signLoyaltyToken({ rid: 'r1', cid: 'c1', ttlSec: 100 }, SECRET, 1000)
    expect(verifyLoyaltyToken(t, SECRET, 1101)).toBeNull()
  })
})
