/**
 * Hook personnalisé pour supprimer définitivement des entités (patients, users, devices)
 * Élimine la duplication de code pour la suppression définitive
 * @module hooks/useEntityPermanentDelete
 */

import { useState, useCallback } from 'react'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

/**
 * Hook pour supprimer définitivement une entité
 * @param {Function} fetchWithAuth - Fonction fetch authentifiée
 * @param {string} API_URL - URL de l'API
 * @param {string} entityType - Type d'entité ('patients', 'users', 'devices')
 * @param {Function} refetch - Fonction pour recharger les données
 * @param {Function} onSuccess - Callback appelé après succès
 * @param {Function} onError - Callback appelé en cas d'erreur
 * @param {Function} invalidateCache - Fonction pour invalider le cache
 * @param {Function} onCloseModal - Fonction optionnelle pour fermer un modal
 * @param {Object} editingItem - Élément en cours d'édition (pour fermer le modal si nécessaire)
 * @returns {Object} { permanentDelete, deleting, error }
 */
export function useEntityPermanentDelete({
  fetchWithAuth,
  API_URL,
  entityType,
  refetch,
  onSuccess,
  onError,
  invalidateCache,
  onCloseModal = null,
  editingItem = null
}) {
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState(null)

  const permanentDelete = useCallback(async (entity) => {
    if (!entity?.id) {
      setError('Entité invalide')
      return
    }

    try {
      setDeleting(entity.id)
      setError(null)

      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/${entityType}/${entity.id}?permanent=true`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )

      if (response.success) {
        // Invalider le cache si fourni
        if (invalidateCache) {
          invalidateCache()
        }
        
        // Recharger les données si fourni
        if (refetch) {
          await refetch()
        }

        // Fermer le modal si l'élément supprimé est en cours d'édition
        if (onCloseModal && editingItem && editingItem.id === entity.id) {
          onCloseModal()
        }

        // Callback de succès
        if (onSuccess) {
          onSuccess(entity)
        }
      } else {
        const errorMessage = response.error || 'Erreur lors de la suppression'
        setError(errorMessage)
        
        // Callback d'erreur
        if (onError) {
          onError(errorMessage, entity)
        } else {
          logger.error(`Erreur suppression ${entityType}:`, errorMessage)
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Erreur lors de la suppression'
      setError(errorMessage)
      
      // Callback d'erreur
      if (onError) {
        onError(errorMessage, entity)
      } else {
        logger.error(`Erreur suppression ${entityType}:`, err)
      }
    } finally {
      setDeleting(null)
    }
  }, [fetchWithAuth, API_URL, entityType, refetch, invalidateCache, onSuccess, onError, onCloseModal, editingItem])

  return {
    permanentDelete,
    deleting,
    error
  }
}

