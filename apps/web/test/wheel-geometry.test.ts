import { describe, expect, it } from 'vitest'
import { distributeSegments, segmentPath, targetRotation, type WheelSeg } from '../src/lib/wheel-geometry'

describe('targetRotation', () => {
  it('calcule la rotation exacte pour amener le segment 0 (8 segments) sous le pointeur', () => {
    // segmentAngle=45 ; segmentCenterAngle=0*45+22.5-90=-67.5 ; randomOffset=(0.5-0.5)*45*0.6=0
    // targetAngle=-(-67.5)-90+0=-22.5 ; distToTarget=(((-22.5-0)%360)+360)%360=337.5
    // extraSpins=5 -> 0 + 5*360 + 337.5 = 2137.5
    expect(targetRotation(0, 8, 0, 0.5)).toBeCloseTo(2137.5, 6)
  })

  it('borne le décalage aléatoire dans ±0.3*segmentAngle', () => {
    const total = 8
    const segmentAngle = 360 / total
    const current = 0
    const base = targetRotation(0, total, current, 0.5) // offset nul (rand=0.5)
    const low = targetRotation(0, total, current, 0)
    const high = targetRotation(0, total, current, 1)
    // l'écart induit par l'offset seul (avant modulo/tours) doit rester dans ±0.3*segmentAngle
    expect(Math.abs(low - base)).toBeLessThanOrEqual(0.3 * segmentAngle + 1e-9)
    expect(Math.abs(high - base)).toBeLessThanOrEqual(0.3 * segmentAngle + 1e-9)
  })

  it("ne tourne jamais en arrière (rotation renvoyée toujours > current)", () => {
    for (const [index, total, current, rand] of [
      [0, 8, 0, 0.5],
      [3, 6, 720, 0.1],
      [5, 5, 123.4, 0.9],
      [1, 4, 359, 0],
    ] as const) {
      const rotation = targetRotation(index, total, current, rand)
      expect(rotation).toBeGreaterThan(current)
    }
  })
})

describe('distributeSegments', () => {
  it('ne place jamais deux voisins de même kind (3 prize + 3 lose)', () => {
    const segs: WheelSeg[] = [
      { key: 'p1', label: 'Prize 1', kind: 'prize', color: '#fff' },
      { key: 'p2', label: 'Prize 2', kind: 'prize', color: '#fff' },
      { key: 'p3', label: 'Prize 3', kind: 'prize', color: '#fff' },
      { key: 'l1', label: 'Lose 1', kind: 'lose', color: '#000' },
      { key: 'l2', label: 'Lose 2', kind: 'lose', color: '#000' },
      { key: 'l3', label: 'Lose 3', kind: 'lose', color: '#000' },
    ]
    const result = distributeSegments(segs)
    expect(result).toHaveLength(6)
    for (let i = 0; i < result.length; i++) {
      const next = result[(i + 1) % result.length]
      expect(result[i].kind).not.toBe(next.kind) // inclut le wrap dernier <-> premier
    }
    // toujours les mêmes segments, juste réordonnés
    expect(result.map((s) => s.key).sort()).toEqual(segs.map((s) => s.key).sort())
  })

  it('renvoie un tableau vide pour une entrée vide', () => {
    expect(distributeSegments([])).toEqual([])
  })
})

describe('segmentPath', () => {
  it('renvoie un path SVG commençant par M et contenant un arc (A)', () => {
    const path = segmentPath(0, 4, 190, 60)
    expect(path.startsWith('M')).toBe(true)
    expect(path).toContain('A')
  })

  it('produit 4 chemins distincts pour total=4', () => {
    const paths = [0, 1, 2, 3].map((i) => segmentPath(i, 4, 190, 60))
    expect(new Set(paths).size).toBe(4)
  })
})
