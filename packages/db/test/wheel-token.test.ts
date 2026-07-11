import { describe, expect, it } from 'vitest'
import { mintRetryToken, signWheelToken, verifyWheelToken } from '../src/wheel-token.js'

const SECRET = 'wheel-secret-123'
const base = { rid: 'r1', cid: 'c1', jti: 'j1', ttlSec: 3600 }

describe('wheel token', () => {
  it('signe puis vérifie à l’identique', () => {
    const t = signWheelToken(base, SECRET, 1000)
    const claims = verifyWheelToken(t, SECRET, 1500)
    expect(claims).toEqual({ rid: 'r1', cid: 'c1', jti: 'j1', exp: 1000 + 3600 })
  })
  it('rejette une signature falsifiée', () => {
    const t = signWheelToken(base, SECRET, 1000)
    expect(verifyWheelToken(t, 'mauvais-secret', 1500)).toBeNull()
    expect(verifyWheelToken(t.slice(0, -3) + 'xxx', SECRET, 1500)).toBeNull()
  })
  it('rejette un token expiré', () => {
    const t = signWheelToken(base, SECRET, 1000)
    expect(verifyWheelToken(t, SECRET, 1000 + 3601)).toBeNull()
  })
  it('rejette un token malformé', () => {
    expect(verifyWheelToken('nimportequoi', SECRET, 1000)).toBeNull()
    expect(verifyWheelToken('', SECRET, 1000)).toBeNull()
  })
})

describe('mintRetryToken', () => {
  it('émet un jeton de rejeu (jti suffixé :r1, TTL 1h, même rid/cid)', () => {
    const t = mintRetryToken({ rid: 'r1', cid: 'c1', jti: 'r1:c1:5' }, SECRET, 1000)
    const claims = verifyWheelToken(t, SECRET, 1500)
    expect(claims).toEqual({ rid: 'r1', cid: 'c1', jti: 'r1:c1:5:r1', exp: 1000 + 3600 })
  })
  it('roundtrip mint/verify identique à un jeton signé directement', () => {
    const minted = mintRetryToken({ rid: 'rA', cid: 'cB', jti: 'jti-origine' }, SECRET, 2000)
    const direct = signWheelToken({ rid: 'rA', cid: 'cB', jti: 'jti-origine:r1', ttlSec: 3600 }, SECRET, 2000)
    expect(minted).toEqual(direct)
  })
  it('expire après 1h (TTL retry), pas 72h comme le jeton d’origine', () => {
    const t = mintRetryToken({ rid: 'r1', cid: 'c1', jti: 'j1' }, SECRET, 1000)
    expect(verifyWheelToken(t, SECRET, 1000 + 3600)).not.toBeNull()
    expect(verifyWheelToken(t, SECRET, 1000 + 3601)).toBeNull()
  })
  it('refuse de générer un retry en chaîne (jti déjà suffixé :r…)', () => {
    expect(() => mintRetryToken({ rid: 'r1', cid: 'c1', jti: 'j1:r1' }, SECRET, 1000)).toThrow()
    expect(() => mintRetryToken({ rid: 'r1', cid: 'c1', jti: 'r1:c1:5:r1' }, SECRET, 1000)).toThrow()
  })
})
