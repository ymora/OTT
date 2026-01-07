'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Bannière qui s'affiche quand l'API est indisponible (déploiement en cours, etc.)
 */
export default function ApiStatusBanner() {
  const [apiDown, setApiDown] = useState(false)
  const [checking, setChecking] = useState(false)
  const { API_URL } = useAuth()

  useEffect(() => {
    // Écouter les erreurs d'API globalement
    const handleApiError = (event) => {
      if (event.detail?.type === 'api_unavailable') {
        setApiDown(true)
      }
    }

    window.addEventListener('api_status', handleApiError)
    return () => window.removeEventListener('api_status', handleApiError)
  }, [])

  const checkApiStatus = async () => {
    setChecking(true)
    try {
      const response = await fetch(`${API_URL}/api.php/health`, {
        method: 'GET',
        cache: 'no-store'
      })
      if (response.ok) {
        setApiDown(false)
      }
    } catch {
      // API toujours down
    } finally {
      setChecking(false)
    }
  }

  if (!apiDown) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-3 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="animate-pulse">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold">🚀 Déploiement en cours</p>
            <p className="text-sm opacity-90">Le serveur est en cours de mise à jour. Les données seront disponibles dans quelques instants.</p>
          </div>
        </div>
        <button
          onClick={checkApiStatus}
          disabled={checking}
          className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg font-medium transition-all disabled:opacity-50"
        >
          {checking ? '⏳ Vérification...' : '🔄 Réessayer'}
        </button>
      </div>
    </div>
  )
}
