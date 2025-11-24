import './globals.css'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { AuthProvider } from '@/contexts/AuthContext'
import { withBasePath } from '@/lib/utils'
import logger from '@/lib/logger'

const inter = Inter({ subsets: ['latin'] })

const isProduction = process.env.NODE_ENV === 'production'
const manifestHref = withBasePath('/manifest.json')
const swPath = withBasePath('/sw.js')
const icon192 = withBasePath('/icon-192.png')
const icon512 = withBasePath('/icon-512.png')

export const metadata = {
  title: 'OTT Dashboard - HAPPLYZ Medical',
  description: 'Plateforme de suivi dispositifs OTT en temps réel'
}

export const viewport = {
  themeColor: '#667eea'
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#667eea" />
        <link rel="manifest" href={manifestHref} />
        <link rel="icon" href={icon192} />
        <link rel="apple-touch-icon" href={icon192} />
        <link rel="apple-touch-icon" sizes="512x512" href={icon512} />
      </head>
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
        
        {/* Script de monitoring désactivé temporairement pour éviter les conflits */}

        {isProduction && (
          <>
            <Script id="sw-register" strategy="afterInteractive" dangerouslySetInnerHTML={{
              __html: `(function() {
                if ('serviceWorker' in navigator) {
                  const swPath = ${JSON.stringify(swPath || '/sw.js')};
                  let isUpdating = false;
                
                const registerSW = () => {
                  navigator.serviceWorker.register(swPath).then(registration => {
                    console.log('[SW] Service worker enregistré');
                    
                    // Vérifier immédiatement les mises à jour
                    registration.update();
                    
                    // Écouter les mises à jour
                    registration.addEventListener('updatefound', () => {
                      const newWorker = registration.installing;
                      if (newWorker && !isUpdating) {
                        isUpdating = true;
                        console.log('[SW] Nouveau service worker détecté, mise à jour en cours...');
                        
                        newWorker.addEventListener('statechange', () => {
                          if (newWorker.state === 'installed') {
                            if (navigator.serviceWorker.controller) {
                              // Nouveau service worker disponible
                              console.log('[SW] Nouveau service worker installé, activation...');
                              newWorker.postMessage({ type: 'SKIP_WAITING' });
                              // NE PAS recharger automatiquement pour éviter les boucles
                              // L'utilisateur peut recharger manuellement si nécessaire
                              isUpdating = false;
                            } else {
                              // Premier chargement, pas besoin de recharger
                              console.log('[SW] Service worker installé pour la première fois');
                              isUpdating = false;
                            }
                          }
                        });
                      }
                    });
                    
                    // Écouter les messages du service worker
                    navigator.serviceWorker.addEventListener('message', (event) => {
                      if (event.data && event.data.type === 'CACHE_CLEARED') {
                        console.log('[SW] Cache nettoyé automatiquement, version:', event.data.version);
                        // NE PAS recharger automatiquement - laisser l'utilisateur décider
                      }
                    });
                  }).catch(err => {
                    console.warn('[SW] Échec de l\'enregistrement:', err);
                  });
                };
                
                // Vérifier les mises à jour régulièrement (toutes les 5 minutes)
                let lastUpdateCheck = 0
                const UPDATE_CHECK_INTERVAL = 300000 // 5 minutes
                const checkForUpdates = () => {
                  const now = Date.now()
                  // Éviter les vérifications trop fréquentes (minimum 1 minute entre chaque)
                  if (now - lastUpdateCheck < 60000) {
                    return
                  }
                  lastUpdateCheck = now
                  
                  navigator.serviceWorker.getRegistration(swPath).then(registration => {
                    if (registration) {
                      registration.update().catch(err => {
                        console.warn('[SW] Erreur lors de la vérification des mises à jour:', err);
                      });
                    }
                  });
                };
                
                // Enregistrer au chargement
                if (document.readyState === 'complete') {
                  registerSW();
                } else {
                  window.addEventListener('load', registerSW, { once: true });
                }
                
                // Vérifier les mises à jour toutes les 5 minutes (au lieu de 1 heure)
                setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL);
                
                // Vérifier aussi lors du retour de focus (l'utilisateur revient sur l'onglet)
                // Mais avec une protection contre les vérifications trop fréquentes
                document.addEventListener('visibilitychange', () => {
                  if (!document.hidden) {
                    // Attendre 2 secondes avant de vérifier pour éviter les boucles
                    setTimeout(checkForUpdates, 2000);
                  }
                });
                }
              })();`
            }} />
          </>
        )}
      </body>
    </html>
  )
}
