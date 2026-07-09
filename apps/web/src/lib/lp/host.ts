export function resolveHostSlug(host: string, rootDomain: string): string | null {
  if (!rootDomain) return null
  const h = host.split(':')[0].toLowerCase()
  if (!h.endsWith(`.${rootDomain}`)) return null
  const sub = h.slice(0, -(rootDomain.length + 1))
  if (!sub || sub === 'www' || sub.includes('.')) return null
  return /^[a-z0-9-]{2,40}$/.test(sub) ? sub : null
}

// Segment-aware check: a path is "protected" only if /app or /admin is a
// full path segment (the segment itself, or followed by /), not merely a
// string prefix. A raw startsWith('/app') would also match unrelated paths
// like /apple-touch-icon.png, /app.webmanifest, /appointments, /administrator
// — which the widened middleware matcher now exposes to this check.
export function isProtectedPath(pathname: string): boolean {
  return (
    pathname === '/app' ||
    pathname.startsWith('/app/') ||
    pathname === '/admin' ||
    pathname.startsWith('/admin/')
  )
}
