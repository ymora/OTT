'use client'

// Désactiver le pré-rendu statique pour cette page
export const dynamic = 'force-dynamic'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Login from '@/components/Login'

export default function HomePage() {
  const { user, loading } = useAuth()

  // Redirection simple et unique si utilisateur déjà connecté
  const router = useRouter()
  useEffect(() => {
    if (!loading && user && typeof window !== 'undefined') {
      // Une seule redirection, pas de boucle
      // Utiliser router.push pour gérer automatiquement le basePath
      const timer = setTimeout(() => {
        router.push('/dashboard')
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div>Chargement...</div>
      </div>
    )
  }

  return <Login />
}

