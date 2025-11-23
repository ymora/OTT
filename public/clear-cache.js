/**
 * Script à exécuter dans la console du navigateur pour forcer la mise à jour
 * Copiez-collez ce code dans la console (F12)
 */

console.log('🔄 Début du nettoyage du cache...')

// 1. Désinscrire tous les service workers
navigator.serviceWorker.getRegistrations().then(function(registrations) {
  console.log(`📋 ${registrations.length} service worker(s) trouvé(s)`)
  
  const unregisterPromises = registrations.map(registration => {
    return registration.unregister().then(() => {
      console.log('  ✓ Service worker désinscrit')
    })
  })
  
  return Promise.all(unregisterPromises)
}).then(() => {
  console.log('✅ Tous les service workers désinscrits')
  
  // 2. Vider tous les caches
  return caches.keys()
}).then(function(names) {
  console.log(`📋 ${names.length} cache(s) trouvé(s)`)
  
  const deletePromises = names.map(name => {
    return caches.delete(name).then(() => {
      console.log(`  ✓ Cache supprimé: ${name}`)
    })
  })
  
  return Promise.all(deletePromises)
}).then(() => {
  console.log('✅ Tous les caches supprimés')
  
  // 3. Vider le localStorage (optionnel)
  const keysToRemove = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.startsWith('ott_') || key.startsWith('sw_'))) {
      keysToRemove.push(key)
    }
  }
  
  keysToRemove.forEach(key => {
    localStorage.removeItem(key)
    console.log(`  ✓ localStorage supprimé: ${key}`)
  })
  
  console.log('✅ Nettoyage terminé')
  console.log('🔄 Rechargement de la page dans 2 secondes...')
  
  // 4. Recharger la page
  setTimeout(() => {
    window.location.reload(true)
  }, 2000)
}).catch(err => {
  console.error('❌ Erreur lors du nettoyage:', err)
})

