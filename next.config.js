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
  // Ne pas utiliser basePath en développement pour éviter les problèmes de routage
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath || ''
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

