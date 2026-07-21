// Génération de CSV « compatible Excel FR » : séparateur point-virgule, fin de ligne CRLF et BOM
// UTF-8 en tête (sans le BOM, Excel Windows lit l'UTF-8 comme du latin-1 et casse les accents).
// Purs et testables — aucune dépendance à Supabase ni à Next.

export const CSV_SEPARATOR = ';'
export const CSV_BOM = '\uFEFF'

export type CsvValue = string | number | boolean | null | undefined

/** Échappe un champ : guillemets doublés + entourage si séparateur, guillemet ou retour ligne. */
export function escapeCsvField(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'string' ? value : String(value)
  if (s.includes('"') || s.includes(CSV_SEPARATOR) || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Sérialise `rows` (tableau de lignes de cellules) précédé de `headers` en CSV FR complet,
 * BOM UTF-8 inclus — la chaîne renvoyée est prête à être servie telle quelle en `text/csv`.
 */
export function toCsv(rows: CsvValue[][], headers: string[]): string {
  const lines = [headers, ...rows].map((cells) => cells.map(escapeCsvField).join(CSV_SEPARATOR))
  return CSV_BOM + lines.join('\r\n') + '\r\n'
}
