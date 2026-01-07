/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production'
const isStaticExport = process.env.NEXT_STATIC_EXPORT === 'true'
// En dev, pas de basePath. En production/export, utiliser /OTT
const basePath = (isDev || !isStaticExport) ? '' : '/OTT'

// Fonction pour obtenir l'URL API (même logique que lib/config.js)
function getApiUrl() {
  // Priorité absolue: Variable d'environnement explicite
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  }
  
  // Détection du mode
  let mode = 'development'
  if (process.env.NEXT_PUBLIC_API_MODE) {
    const envMode = process.env.NEXT_PUBLIC_API_MODE.toLowerCase()
    if (envMode === 'production' || envMode === 'development') {
      mode = envMode
    }
  } else if (process.env.NODE_ENV === 'production') {
    mode = 'production'
  }
  
  // URLs selon le mode
  const apiUrls = {
    production: 'https://ott-jbln.onrender.com',
    development: 'http://localhost:8080',
  }
  
  return apiUrls[mode]
}

const nextConfig = {
  output: isStaticExport ? 'export' : 'standalone',
  reactStrictMode: false, // Désactiver StrictMode pour éviter les problèmes avec Leaflet
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
  // Utilise la configuration centralisée pour déterminer l'URL API
  async rewrites() {
    if (!isStaticExport) {
      const apiUrl = getApiUrl()
      return [
        {
          source: '/api.php/:path*',
          destination: `${apiUrl}/api.php/:path*`
        }
      ]
    }
    return []
  },
  // Désactiver la génération de pages d'erreur statiques en dev
  // Utiliser le commit SHA + timestamp pour forcer de nouveaux hash de fichiers JS à chaque déploiement
  // FORCER un buildId unique à chaque fois pour bypasser complètement le cache
  generateBuildId: async () => {
    const commitSha = process.env.GITHUB_SHA || process.env.COMMIT_SHA
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 9)
    if (commitSha) {
      // Utiliser commit SHA + timestamp + random pour garantir l'unicité absolue
      return `build-${commitSha.slice(0, 7)}-${timestamp}-${random}`
    }
    // Fallback pour les builds locaux
    return `build-${timestamp}-${random}`
  },
  // Désactiver le cache lors du build pour éviter les problèmes
  // En mode export statique, on veut toujours un build frais
  // Note: Next.js 16 utilise Turbopack par défaut, mais on force webpack ici
  webpack: (config, { dev, isServer, webpack }) => {
    if (!dev && isStaticExport) {
      // En export statique, désactiver tous les caches pour forcer la régénération
      config.cache = false
      
      // CRITIQUE: Forcer webpack à générer de nouveaux hash même si le contenu ne change pas
      // Par défaut, Next.js utilise 'deterministic' qui génère les mêmes hash si le contenu est identique
      // On force 'natural' pour que les IDs changent à chaque build
      if (!isServer) {
        // Pour le client, forcer des hash uniques à chaque build
        const buildId = process.env.GITHUB_SHA || process.env.COMMIT_SHA || Date.now().toString()
        const buildTimestamp = Date.now()
        
        config.optimization = {
          ...config.optimization,
          // Utiliser 'natural' au lieu de 'deterministic' pour forcer de nouveaux hash
          // 'natural' génère des IDs séquentiels qui changent à chaque build
          moduleIds: 'natural', // Force de nouveaux IDs même si le contenu est identique
          chunkIds: 'natural',  // Force de nouveaux IDs pour les chunks
          // Désactiver realContentHash pour permettre l'injection du buildId
          realContentHash: false,
        }
        
        // Injecter un commentaire unique dans chaque fichier pour forcer un nouveau hash
        // Cela garantit que même si le contenu est identique, le hash sera différent
        // Utiliser le buildId ET le timestamp pour garantir l'unicité
        const bannerText = `/* Build: ${buildId.slice(0, 7)}-${buildTimestamp} */`
        const existingBanner = config.plugins.find(p => 
          p.constructor.name === 'BannerPlugin' && p.options && p.options.banner
        )
        if (!existingBanner) {
          config.plugins.push(
            new webpack.BannerPlugin({
              banner: bannerText,
              raw: true,
              entryOnly: false
            })
          )
        } else {
          // Mettre à jour le banner existant
          existingBanner.options.banner = bannerText
        }
      }
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

