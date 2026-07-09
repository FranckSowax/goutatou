import { createHmac, timingSafeEqual } from 'node:crypto'

export interface WheelClaims {
  rid: string
  cid: string
  jti: string
  exp: number
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function sign(payloadB64: string, secret: string): string {
  return b64url(createHmac('sha256', secret).update(payloadB64).digest())
}

export function signWheelToken(
  claims: { rid: string; cid: string; jti: string; ttlSec: number },
  secret: string,
  nowSec: number,
): string {
  const payload: WheelClaims = { rid: claims.rid, cid: claims.cid, jti: claims.jti, exp: nowSec + claims.ttlSec }
  const payloadB64 = b64url(Buffer.from(JSON.stringify(payload), 'utf8'))
  return `${payloadB64}.${sign(payloadB64, secret)}`
}

export function verifyWheelToken(token: string, secret: string, nowSec: number): WheelClaims | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [payloadB64, sig] = parts
  const expected = sign(payloadB64, secret)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  try {
    const claims = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as WheelClaims
    if (typeof claims.exp !== 'number' || claims.exp < nowSec) return null
    if (!claims.rid || !claims.cid || !claims.jti) return null
    return claims
  } catch {
    return null
  }
}
