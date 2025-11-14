import './globals.css'
import { Inter } from 'next/font/google'
import Script from 'next/script'

const inter = Inter({ subsets: ['latin'] })

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
const isProduction = process.env.NODE_ENV === 'production'
const withBase = (path) => `${basePath}${path}`
const manifestHref = withBase('/manifest.json')
const swPath = withBase('/sw.js')
const icon192 = withBase('/icon-192.png')
const icon512 = withBase('/icon-512.png')

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
        {children}

        {isProduction && (
          <Script id="sw-register" strategy="afterInteractive">
            {`if ('serviceWorker' in navigator) {
              const registerSW = () => {
                if (navigator.serviceWorker.controller) return;
                navigator.serviceWorker.register('${swPath}').catch(err => {
                  console.warn('SW registration failed', err);
                });
              };
              if (document.readyState === 'complete') {
                registerSW();
              } else {
                window.addEventListener('load', registerSW, { once: true });
              }
            }`}
          </Script>
        )}
      </body>
    </html>
  )
}
