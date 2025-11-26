'use client'

// Désactiver le pré-rendu statique pour cette page
export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Login from '@/components/Login'

export default function HomePage() {
  const { user, loading } = useAuth()

  // Redirection simple et unique si utilisateur déjà connecté
  useEffect(() => {
    if (!loading && user && typeof window !== 'undefined') {
      // Une seule redirection, pas de boucle
      const timer = setTimeout(() => {
        window.location.href = '/dashboard'
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [user, loading])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Chargement...</div>
      </div>
    )
  }

  return <Login />
}

