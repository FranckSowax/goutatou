import { describe, expect, it } from 'vitest'
import { ARRIVAL_COPY, isArrivalText, parseArrivalButton } from '../src/drive/arrival.js'

describe('parseArrivalButton', () => {
  it('arr:<id> → orderId', () => {
    expect(parseArrivalButton('arr:o1')).toBe('o1')
  })

  it('id sans préfixe connu → null', () => {
    expect(parseArrivalButton('in:1')).toBeNull()
    expect(parseArrivalButton('stapp:st-1')).toBeNull()
    expect(parseArrivalButton('unrelated-id')).toBeNull()
    expect(parseArrivalButton('')).toBeNull()
  })

  it('préfixe connu mais orderId vide → null', () => {
    expect(parseArrivalButton('arr:')).toBeNull()
  })

  it('id contenant le préfixe ailleurs qu’au début → null', () => {
    expect(parseArrivalButton('xarr:o1')).toBeNull()
  })

  it('orderId contenant lui-même deux-points → conservé tel quel après le préfixe', () => {
    expect(parseArrivalButton('arr:uuid:with:colons')).toBe('uuid:with:colons')
  })
})

describe('isArrivalText', () => {
  it.each([
    '✅ Je suis arrivé',
    'je suis arrive',
    'Je suis arrivée',
    'JE SUIS ARRIVÉ !',
  ])('%s → true', (text) => {
    expect(isArrivalText(text)).toBe(true)
  })

  it.each([
    'bonjour',
    'menu',
    'je suis là où ?',
  ])('%s → false', (text) => {
    expect(isArrivalText(text)).toBe(false)
  })
})

describe('ARRIVAL_COPY', () => {
  it('copies FR figées attendues par le plan', () => {
    expect(ARRIVAL_COPY.notPending).toBe("Cette commande n'est plus en attente.")
    expect(ARRIVAL_COPY.confirmed).toBe('C\'est noté, on vous apporte votre commande !')
  })
})
