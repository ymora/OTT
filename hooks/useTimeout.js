import { useEffect, useRef } from 'react'

/**
 * Hook personnalisé pour gérer les timeouts avec cleanup automatique
 * @param {Function} callback - Fonction à exécuter après le délai
 * @param {number|null} delay - Délai en millisecondes (null pour désactiver)
 * @param {Array} deps - Dépendances pour réinitialiser le timeout
 */
export function useTimeout(callback, delay, deps = []) {
  const callbackRef = useRef(callback)
  const timeoutRef = useRef(null)

  // Mettre à jour la référence du callback
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    // Si delay est null, ne pas créer de timeout
    if (delay === null) {
      return
    }

    // Créer le timeout
    timeoutRef.current = setTimeout(() => {
      callbackRef.current()
    }, delay)

    // Cleanup
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [delay, ...deps])
}

/**
 * Fonction utilitaire pour créer un timeout avec cleanup
 * Utile dans les handlers d'événements ou callbacks
 * @param {Function} callback - Fonction à exécuter
 * @param {number} delay - Délai en millisecondes
 * @returns {Function} Fonction de cleanup
 */
export function createTimeout(callback, delay) {
  const timeoutId = setTimeout(callback, delay)
  return () => clearTimeout(timeoutId)
}

