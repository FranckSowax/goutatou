import { describe, expect, it } from 'vitest'
import { decryptToken, encryptToken } from '../src/crypto.js'

const KEY = 'a'.repeat(64) // 32 octets hex

describe('crypto tokens Whapi', () => {
  it('chiffre puis déchiffre à l’identique', () => {
    const enc = encryptToken('whapi-secret-token', KEY)
    expect(enc).not.toContain('whapi-secret-token')
    expect(decryptToken(enc, KEY)).toBe('whapi-secret-token')
  })
  it('produit un chiffré différent à chaque appel (IV aléatoire)', () => {
    expect(encryptToken('x', KEY)).not.toBe(encryptToken('x', KEY))
  })
  it('rejette une clé de mauvaise taille', () => {
    expect(() => encryptToken('x', 'abcd')).toThrow()
  })
  it('rejette un payload falsifié (auth tag GCM)', () => {
    const enc = encryptToken('x', KEY)
    const tampered = enc.slice(0, -4) + (enc.endsWith('aaaa') ? 'bbbb' : 'aaaa')
    expect(() => decryptToken(tampered, KEY)).toThrow()
  })
})
