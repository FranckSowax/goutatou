import { describe, expect, it } from 'vitest'
import { nextTier, tierStatus, type Reward } from '../src/lib/loyalty'

const REWARDS: Reward[] = [
  { threshold: 10, label: 'Dessert offert' },
  { threshold: 3, label: 'Boisson offerte' },
  { threshold: 6, label: 'Plat offert' },
]

describe('nextTier', () => {
  it('retourne le plus petit palier > stamps même quand la liste est non triée', () => {
    expect(nextTier(0, REWARDS)).toEqual({ threshold: 3, label: 'Boisson offerte', remaining: 3 })
  })

  it('atteint partiellement -> prochain palier au-dessus du compteur', () => {
    // 4 commandes : le palier 3 est passé, le prochain est 6.
    expect(nextTier(4, REWARDS)).toEqual({ threshold: 6, label: 'Plat offert', remaining: 2 })
  })

  it('tous les paliers atteints -> null', () => {
    expect(nextTier(10, REWARDS)).toBeNull()
    expect(nextTier(15, REWARDS)).toBeNull()
  })

  it('aucun palier configuré -> null', () => {
    expect(nextTier(2, [])).toBeNull()
  })
})

describe('tierStatus', () => {
  it('seuil non atteint -> a_venir', () => {
    expect(tierStatus(6, 4, [])).toBe('a_venir')
  })

  it('seuil atteint mais lot non remis -> atteint', () => {
    expect(tierStatus(3, 4, [])).toBe('atteint')
  })

  it('lot déjà remis -> recupere (prioritaire même si seuil atteint)', () => {
    expect(tierStatus(3, 4, [3])).toBe('recupere')
  })
})
