import { describe, expect, it } from 'vitest'
import { buildStatusCaption, type CaptionDish } from '../src/autostatus/captions.js'
import { buildChannelCaption } from '../src/autochannel/captions.js'

const DISH: CaptionDish = { name: 'Poulet braisé', price: 5000 }

describe('buildChannelCaption', () => {
  it('sans contactPhone (null) : identique à buildStatusCaption, aucun CTA wa.me appendé', () => {
    expect(buildChannelCaption(DISH, 0, null)).toBe(buildStatusCaption(DISH, 0))
  })

  it('avec contactPhone vide : aucun CTA wa.me appendé', () => {
    expect(buildChannelCaption(DISH, 0, '')).toBe(buildStatusCaption(DISH, 0))
  })

  it('avec contactPhone renseigné : appende le lien wa.me avec les chiffres seuls', () => {
    const caption = buildChannelCaption(DISH, 0, '+241 77 000 001')
    expect(caption).toBe(`${buildStatusCaption(DISH, 0)}\n👉 Commander : https://wa.me/24177000001`)
  })

  it('nettoie le numéro (retire tout sauf les chiffres) pour construire le lien', () => {
    const caption = buildChannelCaption(DISH, 1, '24177000001@s.whatsapp.net')
    expect(caption).toContain('\n👉 Commander : https://wa.me/24177000001')
    expect(caption.startsWith(buildStatusCaption(DISH, 1))).toBe(true)
  })

  it('pas d\'effet de bord ni d\'horloge : résultat déterministe pour les mêmes arguments', () => {
    expect(buildChannelCaption(DISH, 2, '24177000001')).toBe(buildChannelCaption(DISH, 2, '24177000001'))
  })
})
