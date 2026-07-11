import type { NextConfig } from 'next'
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
}
export default nextConfig
