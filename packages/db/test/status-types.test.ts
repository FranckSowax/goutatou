import { describe, expect, it } from 'vitest'
import { statusStateLabel } from '../src/types.js'

describe('statusStateLabel', () => {
  it('libellés FR', () => {
    expect(statusStateLabel('scheduled')).toBe('Programmé')
    expect(statusStateLabel('posted')).toBe('Publié')
    expect(statusStateLabel('failed')).toBe('Échec')
  })
})
