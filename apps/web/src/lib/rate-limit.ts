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
  // Mot de passe oublié (/api/auth/recovery) : endpoint public non authentifié qui déclenche
  // generateLink + un envoi WhatsApp — un gérant légitime tente rarement plus de 2-3 fois par
  // heure (il suffit d'un lien reçu). 5/h par IP borne le bruteforce d'emails/l'énumération de
  // comptes sans gêner un usage normal (même ordre de grandeur que wheelUnlockIp).
  recoveryIp: { limit: 5, windowSeconds: 3600 },
  // Profil carte de fidélité (/api/f/profile) : endpoint public authentifié par le jeton HMAC de
  // carte, qui n'écrit que `name`/`birthdate` sur SON propre client. Limite volontairement
  // GÉNÉREUSE : un client peut légitimement corriger son prénom puis sa date de naissance
  // plusieurs fois d'affilée, et plusieurs clients peuvent partager l'IP du Wi-Fi du resto.
  // Le but ici n'est pas l'anti-énumération (le jeton s'en charge) mais un simple plafond
  // anti-boucle/anti-flood, pour la cohérence avec les autres endpoints publics.
  profileIp: { limit: 60, windowSeconds: 3600 },
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

/** Rate-limit par IP pour /api/auth/recovery (mot de passe oublié, self-service). */
export function recoveryRateKeys(ip: string): RateRule[] {
  return [{ key: `recovery:ip:${ip}`, ...RATE_LIMITS.recoveryIp }]
}

/** Rate-limit par IP, scopé au restaurant, pour /api/f/profile (carte de fidélité publique). */
export function profileRateKeys(restaurantId: string, ip: string): RateRule[] {
  return [{ key: `f-profile:ip:${restaurantId}:${ip}`, ...RATE_LIMITS.profileIp }]
}

export type RlDb = {
  rpc(
    fn: 'hit_rate_limit',
    args: { p_key: string; p_limit: number; p_window_seconds: number },
  ): PromiseLike<{ data: { allowed: boolean; retry_after: number }[] | null; error: unknown }>
}

/**
 * Comportement quand l'appel DB `hit_rate_limit` échoue (table indisponible, RPC en erreur) :
 *  - `'allow'` (défaut, fail-open) : la règle est ignorée. C'est le bon arbitrage quand la
 *    disponibilité prime sur l'anti-abus — typiquement le checkout LP, qui ne doit pas tomber
 *    sur un incident du sous-système rate-limit.
 *  - `'deny'` (fail-closed) : la règle est traitée comme atteinte. À réserver aux endpoints où
 *    l'anti-énumération / anti-abus prime sur la disponibilité (`/api/auth/recovery`,
 *    `/api/roue/unlock`) : une panne de la table ne doit pas y désactiver la protection.
 */
export type RateLimitOnError = 'allow' | 'deny'

/**
 * `retryAfter` renvoyé en mode `'deny'` : on n'a pas de fenêtre réelle à annoncer (l'appel DB a
 * échoué), donc on reprend la fenêtre de la règle en cours — même forme de réponse que si la
 * limite était atteinte, aucun signal supplémentaire pour l'appelant.
 */
export async function enforceRateLimit(
  db: RlDb,
  rules: RateRule[],
  opts: { onError?: RateLimitOnError } = {},
): Promise<{ ok: true } | { ok: false; retryAfter: number }> {
  const onError = opts.onError ?? 'allow'
  for (const r of rules) {
    const { data, error } = await db.rpc('hit_rate_limit', {
      p_key: r.key,
      p_limit: r.limit,
      p_window_seconds: r.windowSeconds,
    })
    if (error || !data?.[0]) {
      console.error(`[rate-limit] hit_rate_limit a échoué (fail-${onError === 'deny' ? 'closed' : 'open'})`, error)
      if (onError === 'deny') return { ok: false, retryAfter: r.windowSeconds }
      continue
    }
    if (!data[0].allowed) {
      return { ok: false, retryAfter: data[0].retry_after }
    }
  }
  return { ok: true }
}
