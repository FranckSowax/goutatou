import { describe, expect, it } from 'vitest'
import { buildStatusCaption, type CaptionDish } from '../src/autostatus/captions.js'

const DISH: CaptionDish = { name: 'Poulet braisé', price: 5000 }
const CTA = '📲 Commandez-nous sur WhatsApp !'
const TEMPLATE_COUNT = 7

describe('buildStatusCaption', () => {
  it('génère au moins 6 gabarits tous distincts pour un même plat', () => {
    const captions = new Set<string>()
    for (let i = 0; i < TEMPLATE_COUNT; i++) captions.add(buildStatusCaption(DISH, i))
    expect(captions.size).toBeGreaterThanOrEqual(6)
  })

  it('chaque gabarit contient le nom du plat, le prix formaté et le CTA', () => {
    for (let i = 0; i < TEMPLATE_COUNT; i++) {
      const caption = buildStatusCaption(DISH, i)
      expect(caption).toContain('Poulet braisé')
      expect(caption).toContain('5 000 FCFA')
      expect(caption).toContain(CTA)
    }
  })

  it('index modulo n : boucle proprement au-delà du nombre de gabarits', () => {
    const first = buildStatusCaption(DISH, 0)
    const wrapped = buildStatusCaption(DISH, TEMPLATE_COUNT)
    expect(wrapped).toBe(first)
  })

  it('index négatif : reste dans les bornes (modulo positif)', () => {
    expect(() => buildStatusCaption(DISH, -1)).not.toThrow()
    const caption = buildStatusCaption(DISH, -1)
    expect(caption).toContain('Poulet braisé')
  })

  it('pas d\'effet de bord ni d\'horloge : résultat déterministe pour les mêmes arguments', () => {
    expect(buildStatusCaption(DISH, 2)).toBe(buildStatusCaption(DISH, 2))
  })
})
