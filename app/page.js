'use client'

// En export statique, on ne peut pas utiliser 'force-dynamic'
// La page sera pré-rendue statiquement mais le contenu sera hydraté côté client
// export const dynamic = 'force-dynamic' // DÉSACTIVÉ pour export statique

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Login from '@/components/Login'

export default function HomePage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  // S'assurer qu'on est bien sur la page d'accueil (pas sur une autre route)
  useEffect(() => {
    if (typeof window !== 'undefined' && pathname && pathname !== '/' && pathname !== '/OTT' && pathname !== '/OTT/' && !pathname.startsWith('/OTT/dashboard')) {
      // Si on est sur une route inconnue, rediriger vers la page d'accueil
      // Gérer le basePath /OTT en production
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
      router.replace(basePath || '/')
    }
  }, [pathname, router])

  // Redirection simple et unique si utilisateur déjà connecté
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

  // Toujours afficher le login si pas d'utilisateur
  // Ne jamais afficher la documentation sur la page d'accueil
  return <Login />
}

