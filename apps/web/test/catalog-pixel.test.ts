import { describe, it, expect } from 'vitest'
import { orderUrl, toCatalogId } from '../src/lib/lp/order-url'
import { parseAddParam } from '../src/lib/lp/deep-link'
import { toCsvField, buildCatalogCsv } from '../src/lib/lp/catalog-feed'

describe('toCatalogId', () => {
  it('est l’identité (menu_item.id = retailer_id)', () => {
    expect(toCatalogId('abc-123')).toBe('abc-123')
  })
})

describe('orderUrl', () => {
  it('bâtit le deep-link pour un id', () => {
    expect(orderUrl('https://x.app', 'chez-demo', ['a1'])).toBe('https://x.app/r/chez-demo?add=a1')
  })
  it('gère plusieurs ids + options + slash final', () => {
    expect(orderUrl('https://x.app/', 'chez-demo', ['a1', 'b2'], { qty: 3, mode: 'drive' }))
      .toBe('https://x.app/r/chez-demo?add=a1,b2&qty=3&mode=drive')
  })
})

describe('parseAddParam', () => {
  const known = new Set(['a', 'b', 'c'])
  it('garde les ids connus, ignore les inconnus', () => {
    expect(parseAddParam('a,zzz,b', known)).toEqual(['a', 'b'])
  })
  it('déduplique et respecte le plafond', () => {
    expect(parseAddParam('a,a,b,c', known)).toEqual(['a', 'b', 'c'])
    expect(parseAddParam('a,b,c', known, 2)).toEqual(['a', 'b'])
  })
  it('renvoie [] sur vide/absent', () => {
    expect(parseAddParam('', known)).toEqual([])
    expect(parseAddParam(null, known)).toEqual([])
    expect(parseAddParam('  ,  ', known)).toEqual([])
  })
})

describe('toCsvField', () => {
  it('échappe guillemets et virgules', () => {
    expect(toCsvField('Poulet "DG", épicé')).toBe('"Poulet ""DG"", épicé"')
  })
})

describe('buildCatalogCsv', () => {
  it('produit un CSV Meta avec link=deep-link et prix XAF', () => {
    const csv = buildCatalogCsv(
      [{ id: 'a1', name: 'Poulet DG', description: null, price: 5500, available: true, photoUrl: 'https://img/p.jpg' }],
      'https://x.app',
      'chez-demo',
      'Chez Demo',
    )
    const [header, row] = csv.split('\n')
    expect(header).toBe('"id","title","description","availability","condition","price","link","image_link","brand"')
    expect(row).toContain('"a1"')
    expect(row).toContain('"in stock"')
    expect(row).toContain('"5500 XAF"')
    expect(row).toContain('"https://x.app/r/chez-demo?add=a1"')
    expect(row).toContain('"Chez Demo"')
  })
  it('marque out of stock les plats indisponibles', () => {
    const csv = buildCatalogCsv(
      [{ id: 'x', name: 'Épuisé', description: 'x', price: 1000, available: false, photoUrl: null }],
      'https://x.app', 'demo', 'Demo',
    )
    expect(csv.split('\n')[1]).toContain('"out of stock"')
  })
})
