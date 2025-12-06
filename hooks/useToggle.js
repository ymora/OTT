/**
 * Hook pour gérer un état booléen toggleable
 * Remplace les patterns useState(false) + setValue(!value)
 * @module hooks/useToggle
 */

import { useState, useCallback } from 'react'

/**
 * Hook pour gérer un état booléen avec toggle
 * @param {boolean} initialValue - Valeur initiale (défaut: false)
 * @returns {[boolean, Function, Function, Function]} [value, toggle, setTrue, setFalse]
 */
export function useToggle(initialValue = false) {
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

  return [value, toggle, setTrue, setFalse]
}
