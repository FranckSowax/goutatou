import { describe, expect, it } from 'vitest'
import { buildAreaPath, scaleLinear, sparseTicks } from '../src/components/charts/geometry'

describe('scaleLinear', () => {
  it('mappe linéairement value → range', () => {
    const scale = scaleLinear(100, 50)
    expect(scale(0)).toBe(0)
    expect(scale(50)).toBe(25)
    expect(scale(100)).toBe(50)
  })

  it('domainMax<=0 → toujours 0', () => {
    expect(scaleLinear(0, 50)(10)).toBe(0)
    expect(scaleLinear(-5, 50)(10)).toBe(0)
    expect(scaleLinear(0, 50)(0)).toBe(0)
  })
})

describe('buildAreaPath', () => {
  it('retourne des chaînes vides pour <2 points', () => {
    expect(buildAreaPath([], 100, 50)).toEqual({ line: '', area: '' })
    expect(buildAreaPath([10], 100, 50)).toEqual({ line: '', area: '' })
  })

  it('construit une ligne M…L… et une aire fermée pour 2 points', () => {
    const { line, area } = buildAreaPath([0, 10], 100, 50)

    expect(line).toBe('M0,50 L100,0')
    expect(area).toBe('M0,50 L100,0 L100,50 L0,50 Z')
  })

  it('construit une ligne à N points avec x régulièrement espacés', () => {
    const { line, area } = buildAreaPath([0, 5, 10], 100, 50)

    expect(line).toBe('M0,50 L50,25 L100,0')
    expect(area.startsWith('M0,50 L50,25 L100,0')).toBe(true)
    expect(area.endsWith('L100,50 L0,50 Z')).toBe(true)
  })

  it('valeurs toutes à 0 (ou domaine <=0) → ligne plate à la baseline', () => {
    const { line } = buildAreaPath([0, 0], 100, 50)
    expect(line).toBe('M0,50 L100,50')
  })
})

describe('sparseTicks', () => {
  it('liste vide → []', () => {
    expect(sparseTicks([], 5)).toEqual([])
  })

  it('1 élément → un seul tick à l’index 0', () => {
    expect(sparseTicks(['a'], 5)).toEqual([{ item: 'a', index: 0 }])
  })

  it('nombre d’éléments <= maxTicks → tous les éléments', () => {
    const items = ['a', 'b', 'c']
    expect(sparseTicks(items, 5)).toEqual([
      { item: 'a', index: 0 },
      { item: 'b', index: 1 },
      { item: 'c', index: 2 },
    ])
  })

  it('inclut toujours le premier et le dernier, et respecte maxTicks', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const ticks = sparseTicks(items, 3)

    expect(ticks.length).toBeLessThanOrEqual(3)
    expect(ticks[0]).toEqual({ item: 'a', index: 0 })
    expect(ticks[ticks.length - 1]).toEqual({ item: 'g', index: 6 })
  })

  it('gère un grand nombre d’éléments sans dépasser maxTicks', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    const ticks = sparseTicks(items, 6)

    expect(ticks.length).toBeLessThanOrEqual(6)
    expect(ticks[0].index).toBe(0)
    expect(ticks[ticks.length - 1].index).toBe(29)
  })
})
