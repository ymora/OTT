import './globals.css'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { AuthProvider } from '@/contexts/AuthContext'
import { withBasePath } from '@/lib/utils'

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

        {/* Local (port 3000) : Désactiver le service worker */}
        {/* Production (en ligne) : Service worker activé automatiquement ci-dessous */}
        {!isProduction && (
          <Script
            id="disable-service-worker"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
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
              `
            }}
          />
        )}

        {/* Production (version en ligne) : Activer le service worker */}
        {isProduction && (
          <Script
            id="register-service-worker"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function() {
                  if ('serviceWorker' in navigator) {
                    const swPath = ${JSON.stringify(swPath || '/sw.js')};
                    
                    // Enregistrer le service worker uniquement en production (version en ligne)
                    window.addEventListener('load', () => {
                      navigator.serviceWorker.register(swPath)
                        .catch(function(err) {
                          // Logger l'erreur sans polluer la console en production
                          // Note: logger n'est pas disponible dans ce contexte (script inline)
                          // Le warning est conditionnel à NODE_ENV === 'development'
                          if (process.env.NODE_ENV === 'development') {
                            // Utilisation de console.warn acceptable ici (script inline, pas de logger disponible)
                            console.warn('[SW] Échec enregistrement:', err);
                          }
                        });
                    });
                  }
                })();
              `
            }}
          />
        )}
      </body>
    </html>
  )
}
