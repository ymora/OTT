import { useState, useCallback } from 'react'

/**
 * Hook pour gérer l'état des modals de manière réutilisable
 * Pattern très fréquent dans le projet (utilisé 10+ fois)
 * 
 * @param {boolean} initialState - État initial du modal
 * @returns {Object} État et fonctions pour contrôler le modal
 */
export function useModalState(initialState = false) {
  const [isOpen, setIsOpen] = useState(initialState)
  const [data, setData] = useState(null)

  const openModal = useCallback((modalData = null) => {
    setData(modalData)
    setIsOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
    // Délai pour laisser l'animation de fermeture se terminer
    setTimeout(() => setData(null), 300)
  }, [])

  const toggleModal = useCallback(() => {
    setIsOpen(prev => !prev)
  }, [])

  return {
    isOpen,
    data,
    openModal,
    closeModal,
    toggleModal,
    setData
  }
}

export default useModalState
