const CACHE_NAME = 'ott-dashboard-v3.0.0'
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  event.respondWith(
    caches.match(event.request).then((response) => {
      if (response) return response
      return fetch(event.request).catch(() => caches.match(withBase('/')))
    })
  )
})

