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

        {isProduction && (
          <>
            <Script id="sw-register" strategy="afterInteractive">
              {`if ('serviceWorker' in navigator) {
                const registerSW = () => {
                  // Vérifier si un nouveau service worker est disponible
                  navigator.serviceWorker.register('${swPath}').then(registration => {
                    // Écouter les mises à jour
                    registration.addEventListener('updatefound', () => {
                      const newWorker = registration.installing;
                      if (newWorker) {
                        newWorker.addEventListener('statechange', () => {
                          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // Nouveau service worker disponible, forcer la mise à jour
                            newWorker.postMessage({ type: 'SKIP_WAITING' });
                            window.location.reload();
                          }
                        });
                      }
                    });
                  }).catch(err => {
                    logger.warn('SW registration failed', err);
                  });
                };
                if (document.readyState === 'complete') {
                  registerSW();
                } else {
                  window.addEventListener('load', registerSW, { once: true });
                }
              }`}
            </Script>
            <Script id="sw-update-check" strategy="afterInteractive">
              {`// Vérifier les mises à jour toutes les heures
              if ('serviceWorker' in navigator) {
                setInterval(() => {
                  navigator.serviceWorker.getRegistration('${swPath}').then(registration => {
                    if (registration) {
                      registration.update();
                    }
                  });
                }, 3600000); // 1 heure
              }`}
            </Script>
          </>
        )}
      </body>
    </html>
  )
}
