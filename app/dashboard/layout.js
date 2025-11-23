'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { useAuth } from '@/contexts/AuthContext'
import { UsbProvider } from '@/contexts/UsbContext'

// Authentification toujours requise
const REQUIRE_AUTH = true

function DashboardLayoutContent({ children }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  // Logging pour le débogage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[DashboardLayout] État:', { loading, hasUser: !!user, user })
    }
  }, [loading, user])

  useEffect(() => {
    if (!REQUIRE_AUTH) return
    if (!loading && !user) {
      console.log('[DashboardLayout] Redirection vers / (pas d\'utilisateur)')
      // Next.js gère automatiquement le basePath
      router.push('/')
    }
  }, [user, loading, router])

  if (REQUIRE_AUTH && loading) {
    console.log('[DashboardLayout] Affichage du loader (loading=true)')
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
    console.warn('[DashboardLayout] Pas d\'utilisateur authentifié, redirection en cours...')
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

