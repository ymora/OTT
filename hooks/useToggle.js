import { useState, useCallback } from 'react'

/**
 * Hook pour gérer un état booléen avec toggle, open et close
 * Réduit la duplication de code pour les états on/off, show/hide, etc.
 * 
 * @param {boolean} initialValue - Valeur initiale (défaut: false)
 * @returns {[boolean, Object]} - [valeur, { toggle, open, close, set }]
 * 
 * @example
 * const [isOpen, { toggle, open, close }] = useToggle(false)
 * // Au lieu de:
 * // const [isOpen, setIsOpen] = useState(false)
 * // const toggle = () => setIsOpen(!isOpen)
 * // const open = () => setIsOpen(true)
 * // const close = () => setIsOpen(false)
 */
export function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue)

  const toggle = useCallback(() => setValue(v => !v), [])
  const open = useCallback(() => setValue(true), [])
  const close = useCallback(() => setValue(false), [])
  const set = useCallback((newValue) => setValue(newValue), [])

  return [value, { toggle, open, close, set }]
}

