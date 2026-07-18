import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Jeton HMAC de carte de fidélité : identifie un client (cid) et son resto (rid) sur la page
 * publique `/f/[token]`, sans authentification. Même format compact que le jeton de roue
 * (`base64url(payload).hmac`). La carte est permanente → TTL très long (défaut 10 ans) ; pas de
 * jti ni de rejeu (le +1 en caisse est protégé côté SQL par un cooldown atomique, pas par le jeton).
 */
export interface LoyaltyClaims {
  rid: string
  cid: string
  exp: number
}

const DEFAULT_TTL_SEC = 10 * 365 * 24 * 3600 // ~10 ans

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payloadB64).digest())
}

export function signLoyaltyToken(
  claims: { rid: string; cid: string; ttlSec?: number },
  secret: string,
  nowSec: number,
): string {
  const payload: LoyaltyClaims = { rid: claims.rid, cid: claims.cid, exp: nowSec + (claims.ttlSec ?? DEFAULT_TTL_SEC) }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

export function verifyLoyaltyToken(token: string, secret: string, nowSec: number): LoyaltyClaims | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expected = sign(payloadB64, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const claims = JSON.parse(
      Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as LoyaltyClaims
    if (typeof claims.exp !== 'number' || claims.exp < nowSec) return null
    if (!claims.rid || !claims.cid) return null
    return claims
  } catch {
    return null
  }
}
