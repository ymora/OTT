/**
 * Script pour enregistrer et gérer le service worker en production
 * 
 * SÉCURITÉ: Ce script est statique et ne contient aucune donnée utilisateur.
 * Il gère uniquement l'enregistrement et les mises à jour du service worker.
 * 
 * NOTE: Actuellement désactivé (voir app/layout.js ligne 74)
 * TODO: Réactiver après vérification que le cache est bien vidé
 * 
 * @param {string} swPath - Chemin du service worker (passé via variable globale window.__SW_PATH__)
 */
(function() {
  if ('serviceWorker' in navigator) {
    // DÉSINSCRIRE TOUS LES SERVICE WORKERS EXISTANTS
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for(let registration of registrations) {
        registration.unregister();
      }
    });
    
    // Récupérer le chemin du service worker depuis le meta tag (sécurisé, pas de dangerouslySetInnerHTML)
    const swPathMeta = document.querySelector('meta[name="sw-path"]');
    const swPath = swPathMeta ? swPathMeta.getAttribute('content') : '/sw.js';
    
    // Enregistrer le service worker uniquement en production (version en ligne)
    window.addEventListener('load', () => {
      navigator.serviceWorker.register(swPath, { updateViaCache: 'none' })
        .then(function(registration) {
          // Vérifier les mises à jour du service worker régulièrement
          setInterval(function() {
            registration.update();
          }, 30 * 60 * 1000); // Toutes les 30 minutes
          
          // Écouter les mises à jour disponibles
          registration.addEventListener('updatefound', function() {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', function() {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // Nouvelle version disponible - forcer la mise à jour
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  // Recharger après un court délai pour permettre l'activation
                  setTimeout(function() {
                    window.location.reload();
                  }, 1000);
                }
              });
            }
          });
        })
        .catch(function(err) {
          // Logger l'erreur sans polluer la console en production
          // Note: logger n'est pas disponible dans ce contexte (script externe)
          // Le warning est conditionnel à NODE_ENV === 'development'
          if (process.env.NODE_ENV === 'development') {
            // Utilisation de console.warn acceptable ici (script externe, pas de logger disponible)
            console.warn('[SW] Échec enregistrement:', err);
          }
        });
    });
  }
})();
