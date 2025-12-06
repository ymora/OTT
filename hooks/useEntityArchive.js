/**
 * Hook personnalisé pour archiver des entités (patients, users, devices)
 * Élimine la duplication de code pour l'archivage
 * @module hooks/useEntityArchive
 */

import { useState, useCallback } from 'react'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

/**
 * Hook pour archiver une entité
 * @param {Function} fetchWithAuth - Fonction fetch authentifiée
 * @param {string} API_URL - URL de l'API
 * @param {string} entityType - Type d'entité ('patients', 'users', 'devices')
 * @param {Function} refetch - Fonction pour recharger les données
 * @param {Function} onSuccess - Callback appelé après succès
 * @param {Function} onError - Callback appelé en cas d'erreur
 * @param {Function} invalidateCache - Fonction pour invalider le cache
 * @param {Object} currentUser - Utilisateur actuel (pour vérifier les permissions)
 * @param {Function} onCloseModal - Fonction optionnelle pour fermer un modal
 * @param {Object} editingItem - Élément en cours d'édition (pour fermer le modal si nécessaire)
 * @returns {Object} { archive, archiving, error }
 */
export function useEntityArchive({
  fetchWithAuth,
  API_URL,
  entityType,
  refetch,
  onSuccess,
  onError,
  invalidateCache,
  currentUser = null,
  onCloseModal = null,
  editingItem = null
}) {
  const [archiving, setArchiving] = useState(null)
  const [error, setError] = useState(null)

  const archive = useCallback(async (entity) => {
    if (!entity?.id) {
      setError('Entité invalide')
      return
    }

    try {
      setArchiving(entity.id)
      setError(null)

      // Construire l'URL avec ?archive=true pour les admins, ou DELETE normal pour les non-admins
      const entityId = entity.id
      const url = currentUser?.role_name === 'admin' 
        ? `/api.php/${entityType}/${entityId}?archive=true`
        : `/api.php/${entityType}/${entityId}`

      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        url,
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

        // Fermer le modal si l'élément archivé est en cours d'édition
        if (onCloseModal && editingItem && editingItem.id === entity.id) {
          onCloseModal()
        }

        // Callback de succès
        if (onSuccess) {
          onSuccess(entity)
        }
      } else {
        const errorMessage = response.error || 'Erreur lors de l\'archivage'
        setError(errorMessage)
        
        // Callback d'erreur
        if (onError) {
          onError(errorMessage, entity)
        } else {
          logger.error(`Erreur archivage ${entityType}:`, errorMessage)
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Erreur lors de l\'archivage'
      setError(errorMessage)
      
      // Callback d'erreur
      if (onError) {
        onError(errorMessage, entity)
      } else {
        logger.error(`Erreur archivage ${entityType}:`, err)
      }
    } finally {
      setArchiving(null)
    }
  }, [fetchWithAuth, API_URL, entityType, refetch, invalidateCache, currentUser, onSuccess, onError, onCloseModal, editingItem])

  return {
    archive,
    archiving,
    error
  }
}

