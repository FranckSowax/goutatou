import { describe, expect, it } from 'vitest'
import { signWheelToken, verifyWheelToken } from '../src/wheel-token.js'

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
