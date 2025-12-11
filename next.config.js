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
  // Utiliser le commit SHA pour forcer de nouveaux hash de fichiers JS à chaque déploiement
  generateBuildId: async () => {
    const commitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA
    if (commitSha) {
      // Utiliser les 7 premiers caractères du commit SHA + timestamp pour garantir l'unicité
      return `build-${commitSha.slice(0, 7)}-${Date.now()}`
    }
    // Fallback pour les builds locaux
    return 'build-' + Date.now()
  },
  // Désactiver le cache lors du build pour éviter les problèmes
  // En mode export statique, on veut toujours un build frais
  webpack: (config, { dev, isServer }) => {
    if (!dev && isStaticExport) {
      // En export statique, désactiver certains caches pour forcer la régénération
      config.cache = false
    }
    return config
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

