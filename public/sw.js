// Version du cache - incrémenter à chaque déploiement pour forcer la mise à jour
const CACHE_VERSION = 'v3.1.0'
const CACHE_NAME = `ott-dashboard-${CACHE_VERSION}`
const BASE_PATH = self.location.pathname.replace(/\/sw\.js$/, '')

const withBase = (path) => {
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  return `${BASE_PATH || ''}${path}`
}

const ASSETS = [
  withBase('/'),
  withBase('/manifest.json'),
  withBase('/icon-192.png'),
  withBase('/icon-512.png'),
  withBase('/docs/DOCUMENTATION_PRESENTATION.html'),
  withBase('/docs/DOCUMENTATION_DEVELOPPEURS.html'),
  withBase('/docs/DOCUMENTATION_COMMERCIALE.html')
]

// Install: Mettre en cache les assets de base
self.addEventListener('install', (event) => {
  // NE PAS utiliser skipWaiting() automatiquement - éviter les boucles
  // Le Service Worker sera activé normalement après la fermeture de tous les onglets
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('SW: Erreur lors du cache initial', err)
      })
    })
  )
})

// Écouter les messages pour forcer la mise à jour
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Activate: Nettoyer les anciens caches automatiquement
let isActivating = false
self.addEventListener('activate', (event) => {
  // Protection contre les activations multiples en boucle
  if (isActivating) {
    console.log('[SW] Activation déjà en cours, ignorée')
    return
  }
  
  isActivating = true
  event.waitUntil(
    Promise.all([
      // NE PAS utiliser clients.claim() automatiquement - éviter les boucles
      // Le Service Worker prendra le contrôle naturellement
      // Supprimer TOUS les anciens caches (pas seulement ott-dashboard-)
      caches.keys().then((keys) => {
        const deletePromises = keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => {
            console.log('[SW] Suppression automatique de l\'ancien cache:', key)
            return caches.delete(key)
          })
        console.log(`[SW] ${deletePromises.length} ancien(s) cache(s) à supprimer`)
        return Promise.all(deletePromises)
      }).then(() => {
        console.log('[SW] Nettoyage automatique des caches terminé')
        // NE PAS envoyer de message CACHE_CLEARED automatiquement
        // Le nettoyage doit être uniquement manuel via le bouton
        isActivating = false
      }).catch((err) => {
        console.error('[SW] Erreur lors de l\'activation:', err)
        isActivating = false
      })
    ])
  )
})

// Fetch: Stratégie de cache améliorée
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const pathname = url.pathname
  const hostname = url.hostname
  const scheme = url.protocol

  // CRITIQUE: Ne JAMAIS mettre en cache les requêtes API (Render, localhost, api.php)
  // Cela peut causer des problèmes de données et des boucles de rechargement
  if (pathname.includes('/api.php') || 
      hostname.includes('onrender.com') || 
      hostname.includes('localhost') ||
      hostname.includes('127.0.0.1')) {
    // Laisser passer toutes les requêtes API sans intervention du service worker
    return
  }

  // Ignorer les schémas non supportés (chrome-extension, moz-extension, etc.)
  // Ces requêtes ne peuvent pas être mises en cache
  const unsupportedSchemes = ['chrome-extension:', 'moz-extension:', 'safari-extension:', 'ms-browser-extension:']
  if (unsupportedSchemes.includes(scheme)) {
    // Laisser passer la requête sans intervention du service worker
    return
  }

  // Ignorer les requêtes vers des domaines externes non autorisés
  // (sauf l'API qui est gérée séparément)
  if (scheme !== 'http:' && scheme !== 'https:') {
    return
  }

  // Pour les fichiers _next/static (CSS, JS avec hash), utiliser "network first"
  // Ces fichiers changent de nom à chaque build, donc on ne doit pas les mettre en cache
  if (pathname.includes('/_next/static/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Ne pas mettre en cache les fichiers statiques avec hash
          // Ils changent à chaque build
          return response
        })
        .catch(() => {
          // En cas d'échec réseau, essayer le cache en dernier recours
          return caches.match(event.request)
        })
    )
    return
  }

  // Pour les pages HTML, toujours utiliser "network first" pour éviter les problèmes de cache
  // Laisser Next.js gérer le routage, ne pas intervenir
  if (event.request.destination === 'document' || (!pathname.includes('/_next') && !pathname.includes('/api.php') && !pathname.includes('/docs/'))) {
    // Laisser passer les requêtes de pages sans intervention du service worker
    // Next.js gère le routage correctement
    return
  }

  // Pour les fichiers statiques (images, etc.), utiliser "network first"
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        return response
      })
      .catch(() => {
        // En dernier recours, essayer le cache
        return caches.match(event.request)
      })
  )
})

