import { describe, expect, it } from 'vitest'
import { isProtectedPath, resolveHostSlug } from '../src/lib/lp/host'

describe('resolveHostSlug', () => {
  it('extrait le slug du sous-domaine du domaine racine', () => {
    expect(resolveHostSlug('chez-mama.goutatou.com', 'goutatou.com')).toBe('chez-mama')
    expect(resolveHostSlug('chez-mama.goutatou.com:443', 'goutatou.com')).toBe('chez-mama')
  })
  it('null pour apex, www, netlify, domaines étrangers, rootDomain vide', () => {
    expect(resolveHostSlug('goutatou.com', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('www.goutatou.com', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('goutatou.netlify.app', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('evil.com', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('a.b.goutatou.com', 'goutatou.com')).toBeNull()
    expect(resolveHostSlug('chez-mama.goutatou.com', '')).toBeNull()
  })
})

describe('isProtectedPath', () => {
  it('true pour /app, /admin et leurs sous-chemins', () => {
    expect(isProtectedPath('/app')).toBe(true)
    expect(isProtectedPath('/app/commandes')).toBe(true)
    expect(isProtectedPath('/admin')).toBe(true)
    expect(isProtectedPath('/admin/lp/x')).toBe(true)
  })
  it('false pour les chemins qui commencent seulement par les mêmes lettres', () => {
    expect(isProtectedPath('/apple-touch-icon.png')).toBe(false)
    expect(isProtectedPath('/appointments')).toBe(false)
    expect(isProtectedPath('/administrator')).toBe(false)
    expect(isProtectedPath('/r/x')).toBe(false)
    expect(isProtectedPath('/')).toBe(false)
  })
})
