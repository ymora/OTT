/**
 * Composant d'affichage de succès réutilisable
 * @module components/SuccessMessage
 */

import { useEffect } from 'react'

export default function SuccessMessage({ message, onClose = null, autoClose = 5000, className = '' }) {
  useEffect(() => {
    if (autoClose && onClose) {
      const timer = setTimeout(() => {
        onClose()
      }, autoClose)
      return () => clearTimeout(timer)
    }
  }, [autoClose, onClose])

  if (!message) return null

  return (
    <div className={`bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg animate-slide-down ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium">✅ Succès</p>
          <p className="text-sm mt-1">{message}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-4 text-green-700 hover:text-green-900 text-sm"
            aria-label="Fermer"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  )
}

