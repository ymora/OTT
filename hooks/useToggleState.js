/**
 * Hook pour gérer un état booléen avec des fonctions toggle/on/off
 * Alternative plus simple à useState pour les booléens
 * @module hooks/useToggleState
 */

import { useState, useCallback } from 'react'

/**
 * Hook pour gérer un état booléen avec fonctions utilitaires
 * @param {boolean} initialValue - Valeur initiale (défaut: false)
 * @returns {Array} [value, toggle, setTrue, setFalse, setValue]
 */
export function useToggleState(initialValue = false) {
  const [value, setValue] = useState(initialValue)

  const toggle = useCallback(() => {
    setValue(prev => !prev)
  }, [])

  const setTrue = useCallback(() => {
    setValue(true)
  }, [])

  const setFalse = useCallback(() => {
    setValue(false)
  }, [])

  return [value, toggle, setTrue, setFalse, setValue]
}

