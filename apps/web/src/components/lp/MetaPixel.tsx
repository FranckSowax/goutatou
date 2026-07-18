'use client'
import { useEffect } from 'react'

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue?: unknown[][]
  push?: unknown
  loaded?: boolean
  version?: string
}

declare global {
  interface Window {
    appPixel?: { track: (event: string, data?: Record<string, unknown>) => void }
    fbq?: Fbq
    _fbq?: Fbq
  }
}

/**
 * Pixel Meta par restaurant. Monté HAUT dans l'arbre LP (layout /r/[slug]) avec `pixelId={lp.metaPixelId}`.
 * - Sans pixel : pose `window.appPixel = { track: noop }` et ne charge RIEN.
 * - Avec pixel : injecte le snippet Meta officiel (fbevents.js + init + PageView) et expose
 *   `window.appPixel.track` qui relaie vers `fbq('track', …)`.
 * L'id du pixel est PUBLIC par nature (il finit dans le HTML) — aucun secret ici.
 */
export function MetaPixel({ pixelId }: { pixelId: string | null }) {
  useEffect(() => {
    if (!pixelId) {
      window.appPixel = { track: () => {} }
      return
    }
    // Bootstrap fbq (snippet Meta officiel) une seule fois par page.
    if (!window.fbq) {
      const n: Fbq = function (...args: unknown[]) {
        if (n.callMethod) n.callMethod(...args)
        else (n.queue as unknown[][]).push(args)
      }
      n.queue = []
      n.loaded = true
      n.version = '2.0'
      n.push = n
      window.fbq = n
      if (!window._fbq) window._fbq = n
      const script = document.createElement('script')
      script.async = true
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'
      document.head.appendChild(script)
    }
    window.fbq('init', pixelId)
    window.fbq('track', 'PageView')
    window.appPixel = {
      track: (event, data) => {
        try {
          window.fbq?.('track', event, data)
        } catch {
          /* pixel indisponible : no-op */
        }
      },
    }
  }, [pixelId])
  return null
}
