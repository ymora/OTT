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
 * @returns {Object} { deleteLoading, deleteError, handleDelete, setDeleteError }
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

  const handleDelete = useCallback(async (itemToDelete, endpoint) => {
    const displayName = getEntityName(itemToDelete)
    
    if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer ${entityName} "${displayName}" ?\n\nCette action est irréversible.`)) {
      return
    }

    try {
      setDeleteLoading(true)
      setDeleteError(null)
      
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        endpoint || `/api.php/${entityName}s/${itemToDelete.id}`,
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
      } else {
        throw new Error(response.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      const errorMessage = err.error || err.message || 'Erreur lors de la suppression'
      setDeleteError(errorMessage)
      logger.error(`❌ Erreur suppression ${entityName}:`, errorMessage)
      throw err
    } finally {
      setDeleteLoading(false)
    }
  }, [fetchWithAuth, API_URL, refetch, entityName, getEntityName, onCloseModal])

  return {
    deleteLoading,
    deleteError,
    handleDelete,
    setDeleteError
  }
}

