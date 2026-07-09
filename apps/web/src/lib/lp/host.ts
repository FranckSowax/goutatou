export function resolveHostSlug(host: string, rootDomain: string): string | null {
  if (!rootDomain) return null
  const h = host.split(':')[0].toLowerCase()
  if (!h.endsWith(`.${rootDomain}`)) return null
  const sub = h.slice(0, -(rootDomain.length + 1))
  if (!sub || sub === 'www' || sub.includes('.')) return null
  return /^[a-z0-9-]{2,40}$/.test(sub) ? sub : null
}
