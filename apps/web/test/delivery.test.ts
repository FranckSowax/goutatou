import { describe, it, expect } from 'vitest'
import { deliveryLinks, buildDeliveryMessage } from '../src/lib/delivery'

describe('deliveryLinks', () => {
  it('extrait les coordonnées GPS quand l’adresse est un lien maps du bot', () => {
    const { maps, waze } = deliveryLinks('https://maps.google.com/?q=0.3925,9.4536')
    expect(maps).toBe('https://www.google.com/maps/dir/?api=1&destination=0.3925%2C9.4536')
    expect(waze).toBe('https://waze.com/ul?ll=0.3925%2C9.4536&navigate=yes')
  })

  it('ajoute l’origine resto au lien Maps quand le GPS resto est fourni', () => {
    const { maps } = deliveryLinks('https://maps.google.com/?q=0.39,9.45', { lat: 0.41, lng: 9.44 })
    expect(maps).toContain('destination=0.39%2C9.45')
    expect(maps).toContain('origin=0.41%2C9.44')
  })

  it('encode une adresse texte libre en requête', () => {
    const { maps, waze } = deliveryLinks('Quartier Louis, Libreville')
    expect(maps).toBe('https://www.google.com/maps/dir/?api=1&destination=Quartier%20Louis%2C%20Libreville')
    expect(waze).toBe('https://waze.com/ul?q=Quartier%20Louis%2C%20Libreville&navigate=yes')
  })

  it('ne crashe pas sur une adresse vide', () => {
    const { maps, waze } = deliveryLinks('')
    expect(maps).toContain('https://www.google.com/maps')
    expect(waze).toContain('https://waze.com/ul')
  })
})

describe('buildDeliveryMessage', () => {
  const order = {
    order_number: 42,
    customer_name: 'Awa',
    customer_phone: '24106000001',
    delivery_address: 'Quartier Louis',
    total: 7500,
    items: [
      { name: 'Poulet DG', qty: 2 },
      { name: '↳ Sauce', qty: 1 },
      { name: 'Frites', qty: 1 },
    ],
  }
  const links = { maps: 'https://maps.example/m', waze: 'https://waze.example/w' }

  it('contient le n°, le client, le téléphone, les articles, l’adresse, le total et les 2 liens', () => {
    const msg = buildDeliveryMessage(order, links)
    expect(msg).toContain('n°42')
    expect(msg).toContain('Awa')
    expect(msg).toContain('24106000001')
    expect(msg).toContain('2× Poulet DG +Sauce · 1× Frites')
    expect(msg).toContain('Quartier Louis')
    expect(msg).toContain('7 500')
    expect(msg).toContain('https://maps.example/m')
    expect(msg).toContain('https://waze.example/w')
  })

  it('gère un client sans nom', () => {
    const msg = buildDeliveryMessage({ ...order, customer_name: null }, links)
    expect(msg).toContain('Client')
  })
})
