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

  useEffect(() => {
    if (!REQUIRE_AUTH) return
    if (!loading && !user) {
      // Next.js gère automatiquement le basePath
      router.push('/')
    }
  }, [user, loading, router])

  if (REQUIRE_AUTH && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-[rgb(var(--night-bg-start))]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-[rgb(var(--night-text-primary))]">Chargement...</p>
        </div>
      </div>
    )
  }

  if (REQUIRE_AUTH && !user) return null

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

