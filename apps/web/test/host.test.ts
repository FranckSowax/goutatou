import { describe, expect, it } from 'vitest'
import { resolveHostSlug } from '../src/lib/lp/host'

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
