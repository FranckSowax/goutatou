export type RateRule = { key: string; limit: number; windowSeconds: number }

export const RATE_LIMITS = {
  phone: { limit: 3, windowSeconds: 600 },
  ip: { limit: 12, windowSeconds: 600 },
  resto: { limit: 60, windowSeconds: 3600 },
  // Roue QR publique (/api/roue/unlock) : endpoint public non authentifié qui insère dans
  // `customers` et émet des jetons — quelques tentatives par IP et par heure suffisent à un
  // usage légitime (un client ne tourne qu'une fois par période) tout en bornant le scraping
  // de codes de lot via des numéros fabriqués.
  wheelUnlockIp: { limit: 10, windowSeconds: 3600 },
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

/** Rate-limit par IP et par restaurant pour /api/roue/unlock (roue QR publique). */
export function wheelUnlockRateKeys(restaurantId: string, ip: string): RateRule[] {
  return [{ key: `wheel-unlock:ip:${restaurantId}:${ip}`, ...RATE_LIMITS.wheelUnlockIp }]
}

export type RlDb = {
  rpc(
    fn: 'hit_rate_limit',
    args: { p_key: string; p_limit: number; p_window_seconds: number },
  ): PromiseLike<{ data: { allowed: boolean; retry_after: number }[] | null; error: unknown }>
}

/**
 * Applique les règles dans l'ordre, s'arrête au 1er dépassement.
 * Fail-open : en cas d'erreur DB, on laisse passer (le checkout ne doit pas
 * tomber sur un incident du sous-système rate-limit).
 */
export async function enforceRateLimit(
  db: RlDb,
  rules: RateRule[],
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  for (const r of rules) {
    const { data, error } = await db.rpc('hit_rate_limit', {
      p_key: r.key,
      p_limit: r.limit,
      p_window_seconds: r.windowSeconds,
    })
    if (error || !data?.[0]) {
      console.error('[rate-limit] hit_rate_limit a échoué (fail-open)', error)
      continue
    }
    if (!data[0].allowed) {
      return { ok: false, retryAfter: data[0].retry_after }
    }
  }
  return { ok: true }
}
