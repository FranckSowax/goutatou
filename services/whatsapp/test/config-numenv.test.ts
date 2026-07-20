import { afterEach, describe, expect, it } from 'vitest'
import { numEnv } from '../src/config.js'

const NAME = 'TEST_NUM_ENV'

afterEach(() => {
  delete process.env[NAME]
})

describe('numEnv (audit lot B — correctif 5)', () => {
  it('variable absente → défaut', () => {
    expect(numEnv(NAME, 15000)).toBe(15000)
  })

  it('variable vide (ou espaces) → défaut', () => {
    process.env[NAME] = ''
    expect(numEnv(NAME, 15000)).toBe(15000)
    process.env[NAME] = '   '
    expect(numEnv(NAME, 15000)).toBe(15000)
  })

  it('valeur numérique valide → valeur lue', () => {
    process.env[NAME] = '4200'
    expect(numEnv(NAME, 15000)).toBe(4200)
  })

  it('valeur non numérique → erreur explicite au boot (plus de NaN → boucle chaude)', () => {
    process.env[NAME] = '15s'
    expect(() => numEnv(NAME, 15000)).toThrow(/TEST_NUM_ENV/)
    expect(() => numEnv(NAME, 15000)).toThrow(/15s/)
  })

  it('valeur ≤ 0 → erreur (un poll de 0 ms martèle la base)', () => {
    process.env[NAME] = '0'
    expect(() => numEnv(NAME, 15000)).toThrow(/TEST_NUM_ENV/)
    process.env[NAME] = '-5'
    expect(() => numEnv(NAME, 15000)).toThrow(/TEST_NUM_ENV/)
  })

  it('min: 0 → 0 accepté (MENU_PHOTOS_MAX), négatif toujours refusé', () => {
    process.env[NAME] = '0'
    expect(numEnv(NAME, 8, { min: 0 })).toBe(0)
    process.env[NAME] = '-1'
    expect(() => numEnv(NAME, 8, { min: 0 })).toThrow(/TEST_NUM_ENV/)
  })

  it('Infinity / NaN littéraux refusés', () => {
    process.env[NAME] = 'Infinity'
    expect(() => numEnv(NAME, 15000)).toThrow(/non numérique/)
    process.env[NAME] = 'NaN'
    expect(() => numEnv(NAME, 15000)).toThrow(/non numérique/)
  })
})
