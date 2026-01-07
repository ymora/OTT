'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'

/**
 * Détecte l'environnement d'exécution (Local, Render, Docker)
 */
function getEnvironment(apiUrl) {
  if (!apiUrl) return { name: 'Inconnu', icon: '❓', color: 'gray' }
  
  const url = apiUrl.toLowerCase()
  
  if (url.includes('render.com') || url.includes('onrender.com')) {
    return { name: 'Render', icon: '☁️', color: 'purple' }
  }
  if (url.includes('localhost') || url.includes('127.0.0.1')) {
    // Vérifier si c'est Docker (port typique) ou local
    if (url.includes(':8080') || url.includes(':80')) {
      return { name: 'Docker', icon: '🐳', color: 'blue' }
    }
    return { name: 'Local', icon: '💻', color: 'green' }
  }
  if (url.includes('docker') || url.includes('container')) {
    return { name: 'Docker', icon: '🐳', color: 'blue' }
  }
  
  return { name: 'Externe', icon: '🌐', color: 'indigo' }
}

/**
 * Bannière qui s'affiche quand l'API est indisponible (déploiement en cours, etc.)
 */
export default function ApiStatusBanner() {
  const [apiDown, setApiDown] = useState(false)
  const [checking, setChecking] = useState(false)
  const { API_URL } = useAuth()
  
  const environment = useMemo(() => getEnvironment(API_URL), [API_URL])

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
        // API disponible : rafraîchir la page pour recharger les données
        window.location.reload()
      }
    } catch {
      // API toujours down - ne rien faire, la bannière reste visible
    } finally {
      setChecking(false)
    }
  }

  if (!apiDown) return null

  const getMessage = () => {
    switch (environment.name) {
      case 'Render':
        return 'Le serveur Render est en cours de déploiement. Cela peut prendre 1-2 minutes.'
      case 'Docker':
        return 'Le conteneur Docker ne répond pas. Vérifiez que docker-compose est lancé.'
      case 'Local':
        return 'Le serveur PHP local ne répond pas. Lancez: php -S localhost:8000'
      default:
        return 'Le serveur API ne répond pas. Les données seront disponibles dans quelques instants.'
    }
  }

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
            <p className="font-semibold flex items-center gap-2">
              🚀 API indisponible
              <span className="px-2 py-0.5 bg-white/20 rounded text-xs font-normal">
                {environment.icon} {environment.name}
              </span>
            </p>
            <p className="text-sm opacity-90">{getMessage()}</p>
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
