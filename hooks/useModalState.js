/**
 * Hook pour gérer les états des modals (ouverture, fermeture, données)
 * Élimine la duplication de useState pour les modals
 * @module hooks/useModalState
 */

import { useState, useCallback } from 'react'

/**
 * Hook pour gérer les états d'un modal
 * @param {Object} options - Options de configuration
 * @param {boolean} options.initialOpen - État initial d'ouverture (défaut: false)
 * @param {Function} options.onOpen - Callback appelé à l'ouverture
 * @param {Function} options.onClose - Callback appelé à la fermeture
 * @returns {Object} { isOpen, open, close, toggle, data, setData }
 */
export function useModalState(options = {}) {
  const { initialOpen = false, onOpen, onClose } = options
  
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [data, setData] = useState(null)

  const open = useCallback((modalData = null) => {
    setData(modalData)
    setIsOpen(true)
    if (onOpen) {
      onOpen(modalData)
    }
  }, [onOpen])

  const close = useCallback(() => {
    setIsOpen(false)
    if (onClose) {
      onClose()
    }
    // Optionnel: réinitialiser les données après un délai pour permettre les animations
    setTimeout(() => {
      setData(null)
    }, 300)
  }, [onClose])

  const toggle = useCallback((modalData = null) => {
    if (isOpen) {
      close()
    } else {
      open(modalData)
    }
  }, [isOpen, open, close])

  return {
    isOpen,
    open,
    close,
    toggle,
    data,
    setData
  }
}

