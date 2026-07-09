export type RateRule = { key: string; limit: number; windowSeconds: number }

export const RATE_LIMITS = {
  phone: { limit: 3, windowSeconds: 600 },
  ip: { limit: 12, windowSeconds: 600 },
  resto: { limit: 60, windowSeconds: 3600 },
} as const

/** IP client réelle : header Netlify prioritaire, sinon 1er hop de x-forwarded-for. */
export function clientIp(headers: Headers): string {
  const nf = headers.get('x-nf-client-connection-ip')
  if (nf) return nf.trim()
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return 'unknown'
}

/** Trois couches de rate-limit pour une commande web, dans l'ordre phone → ip → resto. */
export function orderRateKeys(slug: string, phone: string, ip: string): RateRule[] {
  return [
    { key: `order:phone:${slug}:${phone}`, ...RATE_LIMITS.phone },
    { key: `order:ip:${slug}:${ip}`, ...RATE_LIMITS.ip },
    { key: `order:resto:${slug}`, ...RATE_LIMITS.resto },
  ]
}
