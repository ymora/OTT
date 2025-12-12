/**
 * Hook personnalisé pour gérer la suppression d'entités
 * Élimine la duplication de code pour la suppression (users, patients, devices)
 * @module hooks/useEntityDelete
 */

import { useState, useCallback } from 'react'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

/**
 * Hook pour gérer la suppression d'une entité
 * @param {Function} fetchWithAuth - Fonction fetch authentifiée
 * @param {string} API_URL - URL de l'API
 * @param {Function} refetch - Fonction pour recharger les données
 * @param {string} entityName - Nom de l'entité (pour les messages)
 * @param {Function} getEntityName - Fonction pour obtenir le nom affiché de l'entité
 * @param {Function} onCloseModal - Fonction optionnelle pour fermer un modal si l'entité supprimée est en cours d'édition
 * @returns {Object} { deleteLoading, deleteError, handleDelete, setDeleteError, confirmDelete, setConfirmDelete, itemToDelete, setItemToDelete }
 */
export function useEntityDelete({
  fetchWithAuth,
  API_URL,
  refetch,
  entityName = 'élément',
  getEntityName = (item) => item?.name || item?.device_name || item?.first_name || 'cet élément',
  onCloseModal = null
}) {
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [itemToDelete, setItemToDelete] = useState(null)
  const [deleteEndpoint, setDeleteEndpoint] = useState(null)

  // Fonction pour initier la suppression (ouvre le modal de confirmation)
  const handleDelete = useCallback((itemToDelete, endpoint) => {
    setItemToDelete(itemToDelete)
    setDeleteEndpoint(endpoint)
    setConfirmDelete(true)
  }, [])

  // Fonction pour confirmer et exécuter la suppression
  const executeDelete = useCallback(async () => {
    if (!itemToDelete) return

    const displayName = getEntityName(itemToDelete)
    
    try {
      setDeleteLoading(true)
      setDeleteError(null)
      setConfirmDelete(false)
      
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        deleteEndpoint || `/api.php/${entityName}s/${itemToDelete.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      
      if (response.success) {
        logger.log(`✅ ${entityName} supprimé avec succès:`, displayName)
        await refetch()
        
        // Fermer le modal si l'élément supprimé est en cours d'édition
        if (onCloseModal && itemToDelete.id) {
          onCloseModal(itemToDelete.id)
        }
        
        // Réinitialiser l'état
        setItemToDelete(null)
        setDeleteEndpoint(null)
      } else {
        throw new Error(response.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      const errorMessage = err.error || err.message || 'Erreur lors de la suppression'
      setDeleteError(errorMessage)
      logger.error(`❌ Erreur suppression ${entityName}:`, errorMessage)
      // Ne pas réinitialiser itemToDelete en cas d'erreur pour permettre de réessayer
      throw err
    } finally {
      setDeleteLoading(false)
    }
  }, [fetchWithAuth, API_URL, refetch, entityName, getEntityName, onCloseModal, itemToDelete, deleteEndpoint])

  // Fonction pour annuler la suppression
  const cancelDelete = useCallback(() => {
    setConfirmDelete(false)
    setItemToDelete(null)
    setDeleteEndpoint(null)
    setDeleteError(null)
  }, [])

  return {
    deleteLoading,
    deleteError,
    handleDelete,
    setDeleteError,
    confirmDelete,
    setConfirmDelete,
    itemToDelete,
    setItemToDelete,
    executeDelete,
    cancelDelete
  }
}

