import { describe, expect, it } from 'vitest'
import { isOptOutKeyword } from '../src/campaigns/optout.js'

describe('isOptOutKeyword', () => {
  it('reconnaît les variantes FR/EN', () => {
    for (const k of ['STOP', 'stop', ' Stop ', 'Stopper', 'désabonner', 'desabonner', 'UNSUBSCRIBE']) {
      expect(isOptOutKeyword(k)).toBe(true)
    }
  })
  it('ne déclenche pas sur du texte normal', () => {
    for (const k of ['menu', 'je veux commander', 'stop bus', 'arrete']) {
      expect(isOptOutKeyword(k)).toBe(false)
    }
  })
})
