import { describe, expect, it } from 'vitest'
import { arrayMove, positionUpdates } from '../src/lib/reorder'

describe('arrayMove', () => {
  it('déplace un élément vers l\'avant', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c'])
  })

  it('déplace un élément vers l\'arrière', () => {
    expect(arrayMove(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('ne mute pas le tableau original', () => {
    const original = ['a', 'b', 'c']
    const result = arrayMove(original, 0, 2)
    expect(original).toEqual(['a', 'b', 'c'])
    expect(result).not.toBe(original)
  })

  it('retourne une nouvelle instance même sans déplacement', () => {
    const original = ['a', 'b', 'c']
    const result = arrayMove(original, 1, 1)
    expect(result).toEqual(['a', 'b', 'c'])
    expect(result).not.toBe(original)
  })

  it('clamp les bornes négatives sur from', () => {
    expect(arrayMove(['a', 'b', 'c'], -5, 1)).toEqual(['b', 'a', 'c'])
  })

  it('clamp les bornes négatives sur to', () => {
    expect(arrayMove(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b'])
  })

  it('clamp les bornes trop grandes sur from', () => {
    expect(arrayMove(['a', 'b', 'c'], 99, 0)).toEqual(['c', 'a', 'b'])
  })

  it('clamp les bornes trop grandes sur to', () => {
    expect(arrayMove(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a'])
  })

  it('gère un tableau vide sans lever', () => {
    expect(arrayMove([], 0, 1)).toEqual([])
  })

  it('gère un tableau à un seul élément', () => {
    expect(arrayMove(['a'], 0, 0)).toEqual(['a'])
  })
})

describe('positionUpdates', () => {
  it('convertit une liste ordonnée d\'ids en positions 0-based', () => {
    expect(positionUpdates(['x', 'y', 'z'])).toEqual([
      { id: 'x', position: 0 },
      { id: 'y', position: 1 },
      { id: 'z', position: 2 },
    ])
  })

  it('retourne un tableau vide pour une liste vide', () => {
    expect(positionUpdates([])).toEqual([])
  })

  it('gère un seul id', () => {
    expect(positionUpdates(['only'])).toEqual([{ id: 'only', position: 0 }])
  })
})
