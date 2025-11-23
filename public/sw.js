// Version du cache - incrémenter à chaque déploiement pour forcer la mise à jour
const CACHE_VERSION = 'v3.0.1'
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
  withBase('/DOCUMENTATION_PRESENTATION.html'),
  withBase('/DOCUMENTATION_DEVELOPPEURS.html'),
  withBase('/DOCUMENTATION_COMMERCIALE.html')
]

// Install: Mettre en cache les assets de base
self.addEventListener('install', (event) => {
  self.skipWaiting() // Forcer l'activation immédiate
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS).catch((err) => {
        console.warn('SW: Erreur lors du cache initial', err)
      })
    })
  )
})

// Activate: Nettoyer les anciens caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Prendre le contrôle immédiatement
      self.clients.claim(),
      // Supprimer tous les anciens caches
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME && key.startsWith('ott-dashboard-'))
            .map((key) => {
              console.log('SW: Suppression de l\'ancien cache', key)
              return caches.delete(key)
            })
        )
      )
    ])
  )
})

// Fetch: Stratégie de cache améliorée
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const pathname = url.pathname

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

  // Pour les autres fichiers, utiliser "cache first" avec fallback réseau
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(event.request)
        .then((response) => {
          // Mettre en cache uniquement les réponses valides
          if (response.status === 200) {
            const responseToCache = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache)
            })
          }
          return response
        })
        .catch(() => {
          // En dernier recours, retourner la page d'accueil
          if (event.request.destination === 'document') {
            return caches.match(withBase('/'))
          }
        })
    })
  )
})

