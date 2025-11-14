'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import Topbar from '@/components/Topbar'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'

function DashboardLayoutContent({ children }) {
  const router = useRouter()
  const { user, loading } = useAuth()

  // ⚠️ AUTHENTIFICATION TEMPORAIREMENT DÉSACTIVÉE
  // useEffect(() => {
  //   if (!loading && !user) {
  //     router.push('/')
  //   }
  // }, [user, loading, router])

  // if (loading) {
  //   return (
  //     <div className="min-h-screen flex items-center justify-center bg-gray-50">
  //       <div className="text-center">
  //         <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
  //         <p className="text-gray-600">Chargement...</p>
  //       </div>
  //     </div>
  //   )
  // }

  // if (!user) return null

  // ⚠️ MODE DÉMO - ACCÈS DIRECT SANS AUTH
  return (
    <div className="min-h-screen bg-gray-50">
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
  )
}

export default function DashboardLayout({ children }) {
  return (
    <AuthProvider>
      <DashboardLayoutContent>{children}</DashboardLayoutContent>
    </AuthProvider>
  )
}

