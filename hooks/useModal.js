/**
 * Hook personnalisé pour gérer les modals
 * Élimine la duplication de code pour l'ouverture/fermeture des modals
 * @module hooks/useModal
 */

import { useState, useCallback } from 'react'

/**
 * Hook pour gérer l'état d'un modal
 * @param {boolean} initialOpen - État initial (défaut: false)
 * @returns {Object} { isOpen, open, close, toggle }
 */
export function useModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])
  const toggle = useCallback(() => setIsOpen(prev => !prev), [])

  return {
    isOpen,
    open,
    close,
    toggle
  }
}

