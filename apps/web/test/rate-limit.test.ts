import { describe, expect, it } from 'vitest'
import { clientIp, orderRateKeys, wheelUnlockRateKeys, recoveryRateKeys, RATE_LIMITS } from '../src/lib/rate-limit'

function h(init: Record<string, string>): Headers {
  return new Headers(init)
}

describe('clientIp', () => {
  it('priorise x-nf-client-connection-ip', () => {
    expect(clientIp(h({ 'x-nf-client-connection-ip': '41.1.2.3', 'x-forwarded-for': '9.9.9.9' }))).toBe('41.1.2.3')
  })
  it('fallback sur le 1er hop de x-forwarded-for', () => {
    expect(clientIp(h({ 'x-forwarded-for': '41.1.2.3, 10.0.0.1' }))).toBe('41.1.2.3')
  })
  it("retourne 'unknown' si aucune IP", () => {
    expect(clientIp(h({}))).toBe('unknown')
  })
})

describe('orderRateKeys', () => {
  it('produit 3 couches dans l’ordre phone, ip, resto', () => {
    const rules = orderRateKeys('chez-mama', '24177000900', '41.1.2.3')
    expect(rules.map((r) => r.key)).toEqual([
      'order:phone:chez-mama:24177000900',
      'order:ip:chez-mama:41.1.2.3',
      'order:resto:chez-mama',
    ])
  })
  it('applique les bonnes limites/fenêtres', () => {
    const rules = orderRateKeys('chez-mama', '24177000900', '41.1.2.3')
    expect(rules[0]).toMatchObject({ limit: RATE_LIMITS.phone.limit, windowSeconds: RATE_LIMITS.phone.windowSeconds })
    expect(rules[1]).toMatchObject({ limit: RATE_LIMITS.ip.limit, windowSeconds: RATE_LIMITS.ip.windowSeconds })
    expect(rules[2]).toMatchObject({ limit: RATE_LIMITS.resto.limit, windowSeconds: RATE_LIMITS.resto.windowSeconds })
  })
})

describe('wheelUnlockRateKeys', () => {
  it('produit 1 couche par IP scopée au restaurant', () => {
    const rules = wheelUnlockRateKeys('resto-1', '41.1.2.3')
    expect(rules).toEqual([
      { key: 'wheel-unlock:ip:resto-1:41.1.2.3', ...RATE_LIMITS.wheelUnlockIp },
    ])
  })
})

describe('recoveryRateKeys', () => {
  it('produit 1 couche par IP (non scopée à un email, pour ne pas énumérer les comptes)', () => {
    const rules = recoveryRateKeys('41.1.2.3')
    expect(rules).toEqual([{ key: 'recovery:ip:41.1.2.3', ...RATE_LIMITS.recoveryIp }])
  })
  it('applique la limite/fenêtre recoveryIp', () => {
    const rules = recoveryRateKeys('41.1.2.3')
    expect(rules[0]).toMatchObject({
      limit: RATE_LIMITS.recoveryIp.limit,
      windowSeconds: RATE_LIMITS.recoveryIp.windowSeconds,
    })
  })
})
