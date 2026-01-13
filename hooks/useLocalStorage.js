import { useState, useEffect, useCallback } from 'react'
import { logger } from '@/lib/logger'

/**
 * Hook pour gérer le localStorage avec synchronisation automatique
 * Réduit la duplication de code pour la persistance locale
 * 
 * @param {string} key - Clé localStorage
 * @param {*} initialValue - Valeur par défaut
 * @returns {[*, Function, Function]} - [valeur, setValue, removeValue]
 * 
 * @example
 * const [theme, setTheme, removeTheme] = useLocalStorage('theme', 'light')
 * 
 * // Au lieu de:
 * // const [theme, setTheme] = useState(() => {
 * //   try {
 * //     const stored = localStorage.getItem('theme')
 * //     return stored ? JSON.parse(stored) : 'light'
 * //   } catch { return 'light' }
 * // })
 * // useEffect(() => {
 * //   localStorage.setItem('theme', JSON.stringify(theme))
 * // }, [theme])
 */
export function useLocalStorage(key, initialValue) {
  // Initialiser depuis localStorage
  const [storedValue, setStoredValue] = useState(() => {
    if (typeof window === 'undefined') {
      return initialValue
    }

    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      logger.warn(`Erreur lecture localStorage pour clé "${key}":`, error)
      return initialValue
    }
  })

  // Sauvegarder dans localStorage quand la valeur change
  const setValue = useCallback((value) => {
    try {
      // Permettre value d'être une fonction comme useState
      const valueToStore = value instanceof Function ? value(storedValue) : value
      
      setStoredValue(valueToStore)
      
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(key, JSON.stringify(valueToStore))
      }
    } catch (error) {
      logger.error(`Erreur écriture localStorage pour clé "${key}":`, error)
    }
  }, [key, storedValue])

  // Supprimer du localStorage
  const removeValue = useCallback(() => {
    try {
      setStoredValue(initialValue)
      
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(key)
      }
    } catch (error) {
      logger.error(`Erreur suppression localStorage pour clé "${key}":`, error)
    }
  }, [key, initialValue])

  // Synchroniser avec les changements du localStorage (autres onglets)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue))
        } catch (error) {
          logger.warn(`Erreur parsing localStorage event pour clé "${key}":`, error)
        }
      }
    }

    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [key])

  return [storedValue, setValue, removeValue]
}

