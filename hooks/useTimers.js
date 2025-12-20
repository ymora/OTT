/**
 * Hook pour gérer plusieurs timers avec cleanup automatique
 * Version étendue de useTimeout pour gérer des timers nommés
 */

import { useRef, useEffect, useCallback } from 'react'

export function useTimers() {
  const timersRef = useRef(new Map())
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    // Capturer la référence actuelle pour le cleanup
    const currentTimers = timersRef.current
    return () => {
      isMountedRef.current = false
      // Nettoyer tous les timers au démontage
      currentTimers.forEach(timerId => clearTimeout(timerId))
      currentTimers.clear()
    }
  }, [])

  const createTimer = useCallback((name, callback, delay) => {
    if (!isMountedRef.current) return

    // Nettoyer le timer existant si présent
    const existingTimer = timersRef.current.get(name)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    const timerId = setTimeout(() => {
      if (isMountedRef.current) {
        callback()
      }
      timersRef.current.delete(name)
    }, delay)

    timersRef.current.set(name, timerId)
    return timerId
  }, [])

  const clearTimer = useCallback((name) => {
    const timerId = timersRef.current.get(name)
    if (timerId) {
      clearTimeout(timerId)
      timersRef.current.delete(name)
    }
  }, [])

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach(timerId => clearTimeout(timerId))
    timersRef.current.clear()
  }, [])

  const hasTimer = useCallback((name) => {
    return timersRef.current.has(name)
  }, [])

  return {
    createTimer,
    clearTimer,
    clearAllTimers,
    hasTimer
  }
}

export default useTimers

