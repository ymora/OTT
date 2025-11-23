// Version du cache - incrémenter à chaque déploiement pour forcer la mise à jour
const CACHE_VERSION = 'v3.0.4'
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

// Écouter les messages pour forcer la mise à jour
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Activate: Nettoyer les anciens caches automatiquement
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Prendre le contrôle immédiatement
      self.clients.claim(),
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
        // Notifier tous les clients que le cache a été nettoyé
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({
              type: 'CACHE_CLEARED',
              version: CACHE_VERSION
            })
          })
        })
      })
    ])
  )
})

// Fetch: Stratégie de cache améliorée
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  const pathname = url.pathname
  const scheme = url.protocol

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

  // Pour les autres fichiers, utiliser "cache first" avec fallback réseau
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse
      }

      return fetch(event.request)
        .then((response) => {
          // Mettre en cache uniquement les réponses valides et supportées
          // Vérifier que la réponse est clonable et que le schéma est supporté
          if (response.status === 200 && 
              response.type === 'basic' && 
              (scheme === 'http:' || scheme === 'https:')) {
            try {
              const responseToCache = response.clone()
              caches.open(CACHE_NAME).then((cache) => {
                // La vérification du schéma a déjà été faite plus haut, on peut mettre en cache
                cache.put(event.request, responseToCache).catch((err) => {
                  // Ignorer silencieusement les erreurs de cache
                  // (peut arriver pour certaines requêtes spéciales)
                  if (!err.message || (!err.message.includes('chrome-extension') && 
                      !err.message.includes('moz-extension') &&
                      !err.message.includes('unsupported'))) {
                    console.warn('[SW] Erreur lors de la mise en cache:', err)
                  }
                })
              }).catch((err) => {
                console.warn('[SW] Erreur ouverture cache:', err)
              })
            } catch (err) {
              // Ignorer les erreurs de mise en cache (requêtes non clonables, etc.)
              // Ne pas logger les erreurs liées aux extensions
              if (!err.message || (!err.message.includes('chrome-extension') && 
                  !err.message.includes('moz-extension') &&
                  !err.message.includes('unsupported'))) {
                console.warn('[SW] Impossible de mettre en cache:', err)
              }
            }
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

