import type { NextConfig } from 'next'
const nextConfig: NextConfig = {
  webpack: (config) => {
    // Les packages du monorepo (@goutatou/db, @goutatou/whapi) sont consommés depuis leur
    // source TS (pas de dist buildé) avec des specifiers relatifs en `.js` (requis par
    // moduleResolution: NodeNext pour `tsc`). Webpack doit apprendre à résoudre ces `.js`
    // vers les fichiers `.ts`/`.tsx` réels.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    }
    return config
  },
}
export default nextConfig
