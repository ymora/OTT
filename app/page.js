'use client'

import { useEffect, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Login from '@/components/Login'

export default function HomePage() {
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading } = useAuth()
  const hasRedirected = useRef(false)

  // Logging pour le débogage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      console.log('[HomePage] État:', { loading, hasUser: !!user, pathname })
    }
  }, [loading, user, pathname])

  useEffect(() => {
    // Ne pas rediriger si on est déjà en train de rediriger ou si on n'est pas sur la page d'accueil
    if (hasRedirected.current || pathname !== '/') return
    
    // Si l'utilisateur est déjà authentifié, rediriger vers le dashboard
    if (!loading && user) {
      console.log('[HomePage] Utilisateur authentifié, redirection vers /dashboard')
      hasRedirected.current = true
      router.replace('/dashboard')
    } else if (!loading && !user) {
      console.log('[HomePage] Pas d\'utilisateur, affichage du login')
      hasRedirected.current = false
    }
  }, [user, loading, router, pathname])

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

