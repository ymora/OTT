/**
 * Script pour désactiver les service workers en développement local
 * 
 * SÉCURITÉ: Ce script est statique et ne contient aucune donnée utilisateur.
 * Il est chargé uniquement en développement local (port 3000) pour éviter
 * les conflits avec les service workers de production.
 */
(function() {
  // Vérifier que le document est dans un état valide
  if (document.readyState === 'loading' || document.readyState === 'uninitialized') {
    // Attendre que le document soit complètement chargé
    document.addEventListener('DOMContentLoaded', function() {
      disableServiceWorkers();
    });
  } else {
    // Document déjà chargé, exécuter immédiatement
    disableServiceWorkers();
  }
  
  function disableServiceWorkers() {
    // Vérifier que le document est toujours dans un état valide
    if (document.readyState === 'unloading' || document.readyState === 'closed') {
      return; // Document en cours de déchargement, ne rien faire
    }
    
    if ('serviceWorker' in navigator) {
      try {
        // Désenregistrer tous les service workers en local (port 3000)
        navigator.serviceWorker.getRegistrations()
          .then(function(registrations) {
            if (document.readyState === 'unloading' || document.readyState === 'closed') {
              return; // Document en cours de déchargement, ne rien faire
            }
            for(let registration of registrations) {
              registration.unregister().catch(function(err) {
                // Ignorer les erreurs de désenregistrement (peut être normal si déjà désenregistré)
                console.debug('[SW] Erreur désenregistrement:', err);
              });
            }
          })
          .catch(function(err) {
            // Gérer l'erreur InvalidStateError silencieusement
            if (err.name === 'InvalidStateError') {
              console.debug('[SW] Document dans un état invalide, ignoré');
            } else {
              console.warn('[SW] Erreur lors de la récupération des registrations:', err);
            }
          });
      } catch (err) {
        // Gérer les erreurs synchrones
        if (err.name === 'InvalidStateError') {
          console.debug('[SW] Document dans un état invalide, ignoré');
        } else {
          console.warn('[SW] Erreur lors de l\'accès aux Service Workers:', err);
        }
      }
    }
  }
})();
