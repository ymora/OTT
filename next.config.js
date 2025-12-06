/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true'
// En dev, pas de basePath. En production/export, utiliser /OTT
const basePath = (isDev || !isStaticExport) ? '' : '/OTT'

const nextConfig = {
  output: isStaticExport ? 'export' : 'standalone',
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
  // Proxy API - fonctionne en dev et en production (sauf export statique)
  async rewrites() {
    if (!isStaticExport) {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://ott-jbln.onrender.com'
      return [
        {
          source: '/api.php/:path*',
          destination: `${apiUrl}/api.php/:path*`
        }
      ]
    }
    return []
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

// Configuration Sentry (optionnel, nécessite NEXT_PUBLIC_SENTRY_DSN)
const sentryConfig = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
};

module.exports = process.env.NEXT_PUBLIC_SENTRY_DSN 
  ? require("@sentry/nextjs").withSentryConfig(nextConfig, sentryConfig)
  : nextConfig

