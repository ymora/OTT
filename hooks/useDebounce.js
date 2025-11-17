/**
 * Hook personnalisé pour debouncer une valeur
 * Utile pour les champs de recherche
 * @module hooks/useDebounce
 */

import { useState, useEffect } from 'react'

/**
 * Hook pour debouncer une valeur
 * @param {any} value - Valeur à debouncer
 * @param {number} delay - Délai en millisecondes (défaut: 300)
 * @returns {any} Valeur debouncée
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

