/**
 * Hook personnalisé pour gérer les modals d'entités (users, patients, devices)
 * Élimine la duplication de code pour l'ouverture/fermeture des modals
 * @module hooks/useEntityModal
 */

import { useState, useCallback } from 'react'

/**
 * Hook pour gérer l'état d'un modal d'entité
 * @param {boolean} initialOpen - État initial (défaut: false)
 * @returns {Object} { isOpen, editingItem, openCreate, openEdit, close, setEditingItem }
 */
export function useEntityModal(initialOpen = false) {
  const [isOpen, setIsOpen] = useState(initialOpen)
  const [editingItem, setEditingItem] = useState(null)

  const openCreate = useCallback(() => {
    setEditingItem(null)
    setIsOpen(true)
  }, [])

  const openEdit = useCallback((item) => {
    // Ne pas ouvrir le modal pour les éléments archivés
    if (item?.deleted_at) {
      return
    }
    setEditingItem(item)
    setIsOpen(true)
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setEditingItem(null)
  }, [])

  return {
    isOpen,
    editingItem,
    openCreate,
    openEdit,
    close,
    setEditingItem,
    setIsOpen
  }
}

