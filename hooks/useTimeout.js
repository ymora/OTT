import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook pour gérer les timeouts avec cleanup automatique
 * Évite les fuites mémoire et les erreurs "setState on unmounted component"
 * 
 * @returns {Object} Fonctions pour créer et nettoyer les timeouts
 */
export function useTimeout() {
  const timeoutRefs = useRef([])
  const isMountedRef = useRef(true)

  // Cleanup automatique au démontage
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      timeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId))
      timeoutRefs.current = []
    }
  }, [])

  // Créer un timeout avec cleanup automatique
  const createTimeout = useCallback((callback, delay) => {
    if (!isMountedRef.current) return null
    
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        callback()
      }
      // Retirer de la liste après exécution
      timeoutRefs.current = timeoutRefs.current.filter(id => id !== timeoutId)
    }, delay)
    
    timeoutRefs.current.push(timeoutId)
    return timeoutId
  }, [])

  // Nettoyer un timeout spécifique
  const clearTimeoutSafe = useCallback((timeoutId) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
      timeoutRefs.current = timeoutRefs.current.filter(id => id !== timeoutId)
    }
  }, [])

  // Nettoyer tous les timeouts
  const clearAllTimeouts = useCallback(() => {
    timeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId))
    timeoutRefs.current = []
  }, [])

  return {
    createTimeout,
    clearTimeout: clearTimeoutSafe,
    clearAllTimeouts,
    isMounted: () => isMountedRef.current
  }
}

export default useTimeout
