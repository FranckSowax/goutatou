import { describe, it, expect } from 'vitest'
import { CSV_BOM, escapeCsvField, toCsv } from '../src/lib/csv'

describe('escapeCsvField', () => {
  it('laisse un champ simple tel quel', () => {
    expect(escapeCsvField('Marie')).toBe('Marie')
    expect(escapeCsvField(1500)).toBe('1500')
  })

  it('rend null/undefined en cellule vide', () => {
    expect(escapeCsvField(null)).toBe('')
    expect(escapeCsvField(undefined)).toBe('')
  })

  it('entoure et double les guillemets', () => {
    expect(escapeCsvField('Chez "Tonton"')).toBe('"Chez ""Tonton"""')
  })

  it('entoure un champ contenant le séparateur point-virgule', () => {
    expect(escapeCsvField('Poulet; frites')).toBe('"Poulet; frites"')
  })

  it('entoure un champ contenant un retour ligne', () => {
    expect(escapeCsvField('ligne1\nligne2')).toBe('"ligne1\nligne2"')
    expect(escapeCsvField('ligne1\r\nligne2')).toBe('"ligne1\r\nligne2"')
  })
})

describe('toCsv', () => {
  it('préfixe le BOM UTF-8 (Excel)', () => {
    const csv = toCsv([], ['A', 'B'])
    expect(csv.startsWith(CSV_BOM)).toBe(true)
    expect(CSV_BOM).toBe('﻿')
  })

  it('sépare par des point-virgules et termine les lignes en CRLF', () => {
    const csv = toCsv([['Marie', 3]], ['Nom', 'Commandes'])
    expect(csv).toBe(`${CSV_BOM}Nom;Commandes\r\nMarie;3\r\n`)
  })

  it('échappe les cellules des lignes de données', () => {
    const csv = toCsv([['a;b', 'il a dit "oui"', 'x\ny']], ['C1', 'C2', 'C3'])
    expect(csv).toBe(`${CSV_BOM}C1;C2;C3\r\n"a;b";"il a dit ""oui""";"x\ny"\r\n`)
  })

  it('ne produit que l’en-tête quand il n’y a aucune ligne', () => {
    expect(toCsv([], ['Nom'])).toBe(`${CSV_BOM}Nom\r\n`)
  })

  it('un champ échappé reste relisible après un split naïf sur CRLF', () => {
    const csv = toCsv([['multi\r\nligne', 'ok']], ['A', 'B'])
    // Le retour ligne interne est protégé par des guillemets : un parseur CSV correct le lira
    // comme UNE seule ligne de données.
    expect(csv.slice(CSV_BOM.length)).toBe('A;B\r\n"multi\r\nligne";ok\r\n')
  })
})
