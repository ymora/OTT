/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true'
// En dev, pas de basePath. En production/export, utiliser /OTT
const basePath = (isDev || !isStaticExport) ? '' : '/OTT'

const nextConfig = {
  output: isStaticExport ? 'export' : undefined,
  images: {
    unoptimized: true
  },
  // Configuration basePath et assetPrefix pour GitHub Pages
  // En mode export statique, utiliser /OTT pour que les assets soient correctement chargés
  basePath: isStaticExport ? '/OTT' : undefined,
  assetPrefix: isStaticExport ? '/OTT' : undefined,
  trailingSlash: isStaticExport ? true : false,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath || '',
    NEXT_PUBLIC_STATIC_EXPORT: isStaticExport ? 'true' : 'false'
  },
  // Configuration pour éviter les erreurs de pages
  experimental: {
    missingSuspenseWithCSRBailout: false
  },
  // Désactiver la génération de pages d'erreur statiques en dev
  generateBuildId: async () => {
    return 'build-' + Date.now()
  }
}

module.exports = nextConfig

