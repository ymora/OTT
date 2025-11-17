'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Login from '@/components/Login'
import { buildUrl } from '@/lib/utils'

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

export default function HomePage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  useEffect(() => {
    // Si l'utilisateur est déjà authentifié, rediriger vers le dashboard
    if (!loading && user) {
      const dashboardPath = buildUrl('/dashboard', basePath)
      // Utiliser replace au lieu de href pour éviter d'ajouter à l'historique
      window.location.replace(dashboardPath)
    }
  }, [user, loading])

  // Afficher le login si pas authentifié
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Chargement...</p>
        </div>
      </div>
    )
  }

  return <Login />
}

