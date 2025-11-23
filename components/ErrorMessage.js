/**
 * Composant d'affichage d'erreur réutilisable
 * @module components/ErrorMessage
 */

import { useEffect } from 'react'

export default function ErrorMessage({ error, onRetry = null, onClose = null, autoClose = null, className = '' }) {
  // Auto-fermer le message d'erreur si autoClose est défini
  useEffect(() => {
    if (autoClose && onClose && error) {
      const timer = setTimeout(() => {
        onClose()
      }, autoClose)
      return () => clearTimeout(timer)
    }
  }, [autoClose, onClose, error])

  if (!error) return null

  return (
    <div className={`bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg animate-slide-down ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium">❌ Erreur</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
        <div className="flex items-center gap-2">
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-4 text-red-700 hover:text-red-900 underline text-sm"
            >
              Réessayer
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="ml-4 text-red-700 hover:text-red-900 text-sm"
              aria-label="Fermer"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

