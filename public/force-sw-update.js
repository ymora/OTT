/**
 * Script pour forcer la mise à jour du service worker
 * À inclure dans le HTML pour forcer la mise à jour immédiate
 */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function(registrations) {
    for(let registration of registrations) {
      registration.update().then(() => {
        console.log('[SW Update] Service worker mis à jour')
        // Forcer l'activation immédiate
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' })
        }
        // Redémarrer le service worker
        registration.unregister().then(() => {
          console.log('[SW Update] Ancien service worker désinscrit')
          // Réinscrire le nouveau
          navigator.serviceWorker.register('/OTT/sw.js').then(() => {
            console.log('[SW Update] Nouveau service worker inscrit')
            // Recharger la page
            window.location.reload()
          })
        })
      })
    }
  })
  
  // Vider tous les caches
  caches.keys().then(function(names) {
    for (let name of names) {
      if (name.startsWith('ott-dashboard-')) {
        caches.delete(name).then(() => {
          console.log('[SW Update] Cache supprimé:', name)
        })
      }
    }
  })
}

