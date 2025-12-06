/**
 * Hook pour gérer les timers (setTimeout/setInterval) avec cleanup automatique
 * @module hooks/useTimer
 */

import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook pour créer un timeout avec cleanup automatique
 * @param {Function} callback - Fonction à exécuter
 * @param {number} delay - Délai en millisecondes (null pour désactiver)
 * @returns {Function} Fonction pour annuler le timeout
 */
export function useTimeout(callback, delay) {
  const timeoutRef = useRef(null)
  const callbackRef = useRef(callback)

  // Mettre à jour la référence du callback
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null || delay === undefined) return

    timeoutRef.current = setTimeout(() => {
      callbackRef.current()
    }, delay)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [delay])

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  return cancel
}

/**
 * Hook pour créer un interval avec cleanup automatique
 * @param {Function} callback - Fonction à exécuter
 * @param {number} delay - Délai en millisecondes (null pour désactiver)
 * @returns {Function} Fonction pour arrêter l'interval
 */
export function useInterval(callback, delay) {
  const intervalRef = useRef(null)
  const callbackRef = useRef(callback)

  // Mettre à jour la référence du callback
  useEffect(() => {
    callbackRef.current = callback
  }, [callback])

  useEffect(() => {
    if (delay === null || delay === undefined) return

    intervalRef.current = setInterval(() => {
      callbackRef.current()
    }, delay)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [delay])

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [])

  return stop
}

/**
 * Hook pour créer plusieurs timers avec cleanup automatique
 * @returns {Object} { createTimeout, createInterval, clearAll }
 */
export function useTimers() {
  const timersRef = useRef([])

  useEffect(() => {
    return () => {
      // Cleanup tous les timers au démontage
      timersRef.current.forEach(timer => {
        if (timer.type === 'timeout') {
          clearTimeout(timer.id)
        } else if (timer.type === 'interval') {
          clearInterval(timer.id)
        }
      })
      timersRef.current = []
    }
  }, [])

  const createTimeout = useCallback((callback, delay) => {
    const id = setTimeout(() => {
      callback()
      timersRef.current = timersRef.current.filter(t => t.id !== id)
    }, delay)
    timersRef.current.push({ id, type: 'timeout' })
    return id
  }, [])

  const createInterval = useCallback((callback, delay) => {
    const id = setInterval(callback, delay)
    timersRef.current.push({ id, type: 'interval' })
    return id
  }, [])

  const clearAll = useCallback(() => {
    timersRef.current.forEach(timer => {
      if (timer.type === 'timeout') {
        clearTimeout(timer.id)
      } else if (timer.type === 'interval') {
        clearInterval(timer.id)
      }
    })
    timersRef.current = []
  }, [])

  return { createTimeout, createInterval, clearAll }
}

