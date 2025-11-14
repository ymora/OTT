import './globals.css'
import { Inter } from 'next/font/google'
import Script from 'next/script'

const inter = Inter({ subsets: ['latin'] })

const basePath = process.env.NODE_ENV === 'production' ? '/OTT' : ''

export const metadata = {
  title: 'OTT Dashboard - HAPPLYZ Medical',
  description: 'Plateforme de suivi dispositifs OTT en temps réel',
  themeColor: '#667eea',
}

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <meta name="theme-color" content="#667eea" />
      </head>
      <body className={inter.className}>
        {children}
      </body>
    </html>
  )
}
