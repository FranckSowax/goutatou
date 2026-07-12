import { describe, expect, it } from 'vitest'
import { parseLatLng } from '../src/lib/gps'

describe('parseLatLng', () => {
  it('accepte un couple valide', () => {
    expect(parseLatLng('0.3901, 9.4544')).toEqual({ lat: 0.3901, lng: 9.4544 })
  })

  it('tolère espaces superflus et absence d’espace après la virgule', () => {
    expect(parseLatLng('  0.3901 , 9.4544  ')).toEqual({ lat: 0.3901, lng: 9.4544 })
    expect(parseLatLng('0.3901,9.4544')).toEqual({ lat: 0.3901, lng: 9.4544 })
  })

  it('accepte les valeurs négatives', () => {
    expect(parseLatLng('-0.3901, -9.4544')).toEqual({ lat: -0.3901, lng: -9.4544 })
  })

  it('rejette un texte invalide', () => {
    expect(parseLatLng('bonjour')).toBeNull()
    expect(parseLatLng('0.3901')).toBeNull()
    expect(parseLatLng('0.3901, 9.4544, 12')).toBeNull()
    expect(parseLatLng('0,3901, 9,4544')).toBeNull()
  })

  it('rejette les coordonnées hors bornes', () => {
    expect(parseLatLng('91, 9.4544')).toBeNull()
    expect(parseLatLng('-91, 9.4544')).toBeNull()
    expect(parseLatLng('0.3901, 181')).toBeNull()
    expect(parseLatLng('0.3901, -181')).toBeNull()
  })

  it('rejette une saisie vide', () => {
    expect(parseLatLng('')).toBeNull()
    expect(parseLatLng('   ')).toBeNull()
  })
})
