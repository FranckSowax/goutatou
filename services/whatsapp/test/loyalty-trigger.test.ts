import { describe, expect, it } from 'vitest'
import { buildWheelLink, wheelMessage } from '../src/loyalty/trigger.js'

describe('loyalty trigger helpers', () => {
  it('construit le lien roue', () => {
    expect(buildWheelLink('https://goutatou.netlify.app', 'TOK')).toBe('https://goutatou.netlify.app/roue?t=TOK')
  })
  it('message FR contient le lien', () => {
    const m = wheelMessage('https://x/roue?t=TOK')
    expect(m).toContain('https://x/roue?t=TOK')
    expect(m.toLowerCase()).toContain('roue')
  })
})
