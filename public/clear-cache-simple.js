// 🧹 CODE SIMPLE POUR VIDER LE CACHE
// Copiez-collez ce code dans la console (F12) et appuyez sur Entrée

(async () => {
  console.log('🧹 Nettoyage du cache...')
  
  // 1. Désinscrire tous les service workers
  const registrations = await navigator.serviceWorker.getRegistrations()
  for (const reg of registrations) {
    await reg.unregister()
    console.log('✅ Service worker désinscrit')
  }
  
  // 2. Vider tous les caches
  const cacheNames = await caches.keys()
  for (const name of cacheNames) {
    await caches.delete(name)
    console.log('✅ Cache supprimé:', name)
  }
  
  // 3. Recharger la page
  console.log('🔄 Rechargement...')
  setTimeout(() => window.location.reload(true), 500)
})()

