import './globals.css'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { AuthProvider } from '@/contexts/AuthContext'
import { withBasePath } from '@/lib/utils'

const inter = Inter({ subsets: ['latin'] })

// Détecter si on est en production (export statique ou serveur)
// En export statique, NODE_ENV peut ne pas être "production", donc on vérifie aussi l'absence de localhost
const isProduction = process.env.NODE_ENV === 'production' || 
                     (typeof window !== 'undefined' && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1'))
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
    <html lang="fr" data-scroll-behavior="smooth">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#667eea" />
        {/* Meta tags pour forcer le rechargement et éviter le cache */}
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <link rel="manifest" href={manifestHref} />
        <link rel="icon" href={icon192} />
        <link rel="apple-touch-icon" href={icon192} />
        <link rel="apple-touch-icon" sizes="512x512" href={icon512} />
        {/* Meta tag pour passer le chemin du service worker au script externe (évite dangerouslySetInnerHTML) */}
        {isProduction && <meta name="sw-path" content={swPath} />}
      </head>
      <body className={inter.className}>
        <AuthProvider>
          {children}
        </AuthProvider>
        
        {/* Script de monitoring désactivé temporairement pour éviter les conflits */}

        {/* 
          Service Worker Management
          =========================
          SÉCURITÉ: Les scripts sont chargés depuis des fichiers externes (public/scripts/)
          au lieu d'utiliser dangerouslySetInnerHTML, éliminant tout risque XSS.
          
          - En développement local: Désactive les service workers pour éviter les conflits
          - En production: Enregistre et gère le service worker (actuellement désactivé)
        */}
        
        {/* Local (port 3000) : Désactiver le service worker */}
        {!isProduction && (
          <Script
            id="disable-service-worker"
            strategy="afterInteractive"
            src={withBasePath('/scripts/disable-service-worker.js')}
          />
        )}

        {/* Production (version en ligne) : Service worker TEMPORAIREMENT DÉSACTIVÉ pour reset GitHub Pages */}
        {/* TODO: Réactiver après vérification que le cache est bien vidé */}
        {false && isProduction && (
          <Script
            id="register-service-worker"
            strategy="afterInteractive"
            src={withBasePath('/scripts/register-service-worker.js')}
          />
        )}
      </body>
    </html>
  )
}
