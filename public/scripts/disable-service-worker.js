/**
 * Script pour désactiver les service workers en développement local
 * 
 * SÉCURITÉ: Ce script est statique et ne contient aucune donnée utilisateur.
 * Il est chargé uniquement en développement local (port 3000) pour éviter
 * les conflits avec les service workers de production.
 */
(function() {
  if ('serviceWorker' in navigator) {
    // Désenregistrer tous les service workers en local (port 3000)
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
      }
    });
  }
})();
