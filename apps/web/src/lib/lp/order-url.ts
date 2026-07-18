// Fabrique d'URL UNIQUE du deep-link « ajouter au panier », partagée par le flux catalogue Meta et
// tout lien « commander en ligne » du bot. Ne jamais coder un 2e format de lien concurrent.

/**
 * Convertit un id storefront (celui que le panier connaît) en id catalogue (celui du flux + pixel).
 * Chez Goutatou, le catalogue WhatsApp utilise déjà `retailer_id = menu_item.id` (migration 0021),
 * donc c'est l'IDENTITÉ. Point d'extension unique si la convention change un jour — ne jamais
 * disperser cette règle dans le code.
 */
export function toCatalogId(menuItemId: string): string {
  return menuItemId
}

/**
 * Deep-link panier pré-rempli : `${baseUrl}/r/${slug}?add=<id[,id2]>[&qty=][&mode=]`.
 * `baseUrl` sans slash final ; ids encodés. Utilisé par `catalog.csv` (champ `link`) et le bot.
 */
export function orderUrl(
  baseUrl: string,
  slug: string,
  menuItemIds: string[],
  opts?: { qty?: number; mode?: string },
): string {
  const base = baseUrl.replace(/\/+$/, '')
  const add = menuItemIds.map((id) => encodeURIComponent(id)).join(',')
  const params = new URLSearchParams({ add })
  if (opts?.qty && opts.qty > 1) params.set('qty', String(opts.qty))
  if (opts?.mode) params.set('mode', opts.mode)
  // URLSearchParams encode la virgule en %2C — on la restaure pour un lien lisible (les ids sont
  // déjà encodés individuellement, la virgule reste un simple séparateur).
  return `${base}/r/${encodeURIComponent(slug)}?${params.toString().replace(/%2C/g, ',')}`
}
