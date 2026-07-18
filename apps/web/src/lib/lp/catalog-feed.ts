import { orderUrl, toCatalogId } from './order-url'

export interface FeedProduct {
  id: string // menu_item.id (= retailer_id)
  name: string
  description: string | null
  price: number // FCFA
  available: boolean
  photoUrl: string | null
}

/** Échappe un champ pour CSV : entoure de guillemets et double les guillemets internes. */
export function toCsvField(value: string): string {
  const s = value ?? ''
  return `"${s.replace(/"/g, '""')}"`
}

/** Une ligne CSV à partir de champs déjà ordonnés. */
export function toCsvRow(fields: string[]): string {
  return fields.map(toCsvField).join(',')
}

// En-têtes compatibles flux catalogue Meta (Commerce/DPA).
const HEADERS = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand']

/**
 * Génère un CSV catalogue Meta. `link` = deep-link (même fabrique que le bot) ; `price` en XAF
 * (code ISO du FCFA) ; `availability` déduit de `available`. Prix jamais figé dans l'URL — il vient
 * du menu à la génération.
 */
export function buildCatalogCsv(
  products: FeedProduct[],
  baseUrl: string,
  slug: string,
  brand: string,
): string {
  const rows = [toCsvRow(HEADERS)]
  for (const p of products) {
    rows.push(
      toCsvRow([
        toCatalogId(p.id),
        p.name,
        p.description ?? p.name,
        p.available ? 'in stock' : 'out of stock',
        'new',
        `${p.price} XAF`,
        orderUrl(baseUrl, slug, [p.id]),
        p.photoUrl ?? '',
        brand,
      ]),
    )
  }
  return rows.join('\n')
}
