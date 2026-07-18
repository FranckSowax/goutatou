/** Plafond de lignes ajoutées via un deep-link (anti-abus). */
export const MAX_ADD_LINES = 12

/**
 * Parse le paramètre `?add=id1,id2,…` en une liste d'ids À AJOUTER : trim, ne garde que les ids
 * CONNUS (présents dans `knownIds` — sinon ignore silencieusement, pas d'injection), déduplique, et
 * plafonne à `maxLines`. Renvoie `[]` si `raw` est vide/absent.
 */
export function parseAddParam(
  raw: string | null | undefined,
  knownIds: Set<string>,
  maxLines: number = MAX_ADD_LINES,
): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of raw.split(',')) {
    const id = part.trim()
    if (!id || seen.has(id) || !knownIds.has(id)) continue
    seen.add(id)
    out.push(id)
    if (out.length >= maxLines) break
  }
  return out
}
