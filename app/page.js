'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Login from '@/components/Login'

export default function HomePage() {
  const router = useRouter()
  const { user, loading } = useAuth()

  // Logging pour le débogage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[HomePage] État:', { loading, hasUser: !!user, user })
    }
  }, [loading, user])

  useEffect(() => {
    // Si l'utilisateur est déjà authentifié, rediriger vers le dashboard
    // Next.js router gère automatiquement le basePath
    if (!loading && user) {
      console.log('[HomePage] Utilisateur authentifié, redirection vers /dashboard')
      router.replace('/dashboard')
    } else if (!loading && !user) {
      console.log('[HomePage] Pas d\'utilisateur, affichage du login')
    }
  }, [user, loading, router])

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

