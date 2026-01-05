'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { useAuth } from '@/contexts/AuthContext'
import { UsbProvider} from '@/contexts/UsbContext'
import logger from '@/lib/logger'

// Authentification toujours requise
const REQUIRE_AUTH = true

function DashboardLayoutContent({ children }) {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const hasRedirected = useRef(false)

  // Logging pour le débogage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      logger.debug('[DashboardLayout] État:', { loading, hasUser: !!user, pathname })
    }
  }, [loading, user, pathname])

  useEffect(() => {
    if (!REQUIRE_AUTH) return
    // Ne pas rediriger si on est déjà en train de rediriger ou si on n'est pas dans le dashboard
    if (hasRedirected.current || !pathname?.startsWith('/dashboard')) return
    
    if (!loading && !user) {
      logger.debug('[DashboardLayout] Redirection vers / (pas d\'utilisateur)')
      hasRedirected.current = true
      // Next.js gère automatiquement le basePath
      router.replace('/')
    } else if (!loading && user) {
      // Réinitialiser le flag si l'utilisateur est authentifié
      hasRedirected.current = false
    }
  }, [user, loading, router, pathname])

  if (REQUIRE_AUTH && loading) {
    logger.debug('[DashboardLayout] Affichage du loader (loading=true)')
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[rgb(var(--night-bg-start))]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-[rgb(var(--night-text-primary))]">Chargement...</p>
        </div>
      </div>
    )
  }

  if (REQUIRE_AUTH && !user) {
    logger.warn('[DashboardLayout] Pas d\'utilisateur authentifié, redirection en cours...')
    // Afficher un message au lieu de retourner null
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Redirection vers la page de connexion...</p>
        </div>
      </div>
    )
  }

  return (
    <UsbProvider>
      <div className="min-h-screen bg-gray-50 dark:bg-[rgb(var(--night-bg-start))]">
        <Topbar />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6 ml-64 mt-16">
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </main>
        </div>
      </div>
    </UsbProvider>
  )
}

export default function DashboardLayout({ children }) {
  return <DashboardLayoutContent>{children}</DashboardLayoutContent>
}
