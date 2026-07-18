import { describe, expect, it } from 'vitest'
import { buildCardLink, cardMessage, cardMessageBody } from '../src/loyalty/card-trigger.js'

describe('carte de fidélité — helpers', () => {
  it('construit le lien carte (/f/<token>)', () => {
    expect(buildCardLink('https://goutatou.netlify.app', 'TOK')).toBe('https://goutatou.netlify.app/f/TOK')
  })

  it('cardMessageBody : message FR chaleureux, mention fidélité, SANS lien brut', () => {
    const body = cardMessageBody()
    expect(body.toLowerCase()).toContain('fidélité')
    expect(body).not.toContain('http')
  })

  it('cardMessage : corps + lien sur une nouvelle ligne', () => {
    const link = 'https://x/f/TOK'
    const m = cardMessage(link)
    expect(m).toContain(link)
    expect(m).toContain(cardMessageBody())
    expect(m.toLowerCase()).toContain('fidélité')
  })
})
