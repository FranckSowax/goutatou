const KEYWORDS = new Set(['stop', 'stopper', 'desabonner', 'unsubscribe'])

export function isOptOutKeyword(input: string): boolean {
  const normalized = input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents (désabonner -> desabonner)
  return KEYWORDS.has(normalized)
}
