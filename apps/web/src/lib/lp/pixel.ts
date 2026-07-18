// Wrapper de tracking sûr : appelle `window.appPixel.track` posé par <MetaPixel>. Toujours un no-op
// si le pixel n'est pas configuré (appPixel absent ou track no-op) → le deep-link marche SANS pixel.
export function track(event: string, data?: Record<string, unknown>): void {
  if (typeof window !== 'undefined') {
    ;(
      window as unknown as {
        appPixel?: { track?: (event: string, data?: Record<string, unknown>) => void }
      }
    ).appPixel?.track?.(event, data)
  }
}
