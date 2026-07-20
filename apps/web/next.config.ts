import type { NextConfig } from 'next'

/**
 * Origine Supabase (REST + Realtime) autorisée par la CSP du back-office.
 * Lue au build depuis `NEXT_PUBLIC_SUPABASE_URL` (même variable que le client navigateur,
 * cf. src/middleware.ts et les Realtime dans src/app/app/**). Si elle est absente au build
 * (CI sans env), on retombe sur le wildcard `*.supabase.co` plutôt que de produire une CSP
 * qui couperait l'app.
 */
function supabaseOrigins(): { http: string; ws: string } {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return { http: 'https://*.supabase.co', ws: 'wss://*.supabase.co' }
  try {
    const { origin, host } = new URL(raw)
    return { http: origin, ws: `wss://${host}` }
  } catch {
    return { http: 'https://*.supabase.co', ws: 'wss://*.supabase.co' }
  }
}

/**
 * En-têtes appliqués à TOUTES les routes (LP publique `/r/:slug` comprise).
 * Aucun de ces en-têtes ne bloque de ressource : ils durcissent le transport, le sniffing
 * MIME, le referrer et l'embarquement en iframe.
 */
const BASE_SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Aucune page du produit n'est destinée à être embarquée (pas un seul <iframe> dans src/).
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  // Vérifié dans le code avant de restreindre : aucune utilisation de `navigator.geolocation`,
  // `getUserMedia` (caméra/micro), ni d'API de paiement navigateur. Le seul usage média est
  // Web Audio (carillon cuisine, src/lib/chime.ts) qui n'est gouverné par aucune de ces
  // directives. On ne liste QUE des fonctionnalités non utilisées.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=(), midi=(), serial=(), bluetooth=()',
  },
]

/**
 * CSP — OPTION (b) retenue : CSP d'application (bloquante) UNIQUEMENT sur `/app/*` et
 * `/admin/*`, rien sur la LP publique `/r/:slug` ni sur les autres routes.
 *
 * Pourquoi (b) plutôt qu'un Report-Only global : le périmètre a pu être validé par lecture du
 * code, ce qui rend la CSP sûre à activer tout de suite là où elle protège le plus (sessions
 * gérant/admin) :
 *  - le pixel Meta (`connect.facebook.net` + images `facebook.com`) vit uniquement dans
 *    `src/components/lp/MetaPixel.tsx`, monté par les pages publiques `/r/*` — donc hors
 *    périmètre : la CSP ne peut pas le casser ;
 *  - GSAP / Lenis (`src/components/lp/*`) sont eux aussi LP-only, et de toute façon bundlés
 *    en `self` (pas de CDN) ;
 *  - les polices passent par `next/font/google` (src/app/layout.tsx) : Next les télécharge au
 *    build et les sert depuis `/_next/static` → `self`, aucun appel à fonts.googleapis.com ;
 *  - aucun script externe n'est chargé sous `/app` ou `/admin` (grep des `https://` de
 *    src/app/app, src/app/admin, src/components, src/lib : uniquement des liens sortants
 *    wa.me / maps / waze, pas des ressources) ;
 *  - les images viennent de Supabase Storage (cf. `images.remotePatterns` ci-dessous) plus
 *    `data:`/`blob:` (export QR en SVG, src/app/app/marketing/qr/qr-card.tsx) ;
 *  - le réseau sortant est Supabase REST + Realtime (wss), d'où `connect-src`.
 *
 * `'unsafe-inline'` reste nécessaire sur `script-src` (scripts d'hydratation/flight de l'App
 * Router et script de thème de next-themes, injectés sans nonce) et sur `style-src` (styles
 * inline React + Tailwind). Un durcissement par nonce imposerait de passer la CSP par le
 * middleware ; hors périmètre de ce lot. La CSP reste utile telle quelle : elle interdit tout
 * script d'origine externe, tout `object`/`embed`, la réécriture de `<base>` et l'embarquement
 * en iframe.
 */
function appCsp(): string {
  const { http, ws } = supabaseOrigins()
  const dev = process.env.NODE_ENV !== 'production'
  return [
    "default-src 'self'",
    // `'unsafe-eval'` uniquement en dev : `next dev` en a besoin pour le HMR.
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    // `https:` (et pas seulement Supabase Storage) : les photos de plats peuvent pointer vers
    // n'importe quel hébergeur — données de démonstration sur images.unsplash.com, photos
    // importées par un restaurant… — et sont rendues en `<img>` brut, hors `images.remotePatterns`.
    // Une liste blanche casserait ces menus (constaté par le test e2e CSP sur /app/menu). Les
    // images ne sont pas un vecteur d'exécution ; le durcissement utile reste sur `script-src`,
    // `connect-src` et `frame-ancestors`. `http:` demeure interdit (+ upgrade-insecure-requests).
    'img-src \'self\' data: blob: https:',
    "font-src 'self' data:",
    `media-src 'self' blob: data: ${http}`,
    `connect-src 'self' ${http} ${ws}${dev ? ' ws://localhost:* http://localhost:*' : ''}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    'upgrade-insecure-requests',
  ].join('; ')
}

const nextConfig: NextConfig = {
  // Photos menu (Server Action) : la limite par défaut de 1 Mo rejette les photos
  // de téléphone. 4 Mo reste sous le plafond Netlify Functions (~6 Mo encodé).
  // Les VIDÉOS hero LP ne passent PAS par une action : upload direct storage.
  experimental: { serverActions: { bodySizeLimit: '4mb' } },
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'vaowvldazfcmietacctz.supabase.co', pathname: '/storage/v1/object/public/**' },
    ],
  },
  async headers() {
    const csp = { key: 'Content-Security-Policy', value: appCsp() }
    return [
      { source: '/:path*', headers: BASE_SECURITY_HEADERS },
      // `/app` et `/admin` sont listés explicitement en plus de `/:path*` : ne pas dépendre du
      // fait que `:path*` (zéro segment ou plus) couvre bien la racine du segment.
      { source: '/app', headers: [csp] },
      { source: '/app/:path*', headers: [csp] },
      { source: '/admin', headers: [csp] },
      { source: '/admin/:path*', headers: [csp] },
    ]
  },
}
export default nextConfig
