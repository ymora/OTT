/**
 * Hook personnalisé pour restaurer des entités archivées (patients, users, devices)
 * Élimine la duplication de code pour la restauration
 * @module hooks/useEntityRestore
 */

import { useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import logger from '@/lib/logger'

/**
 * Hook pour restaurer une entité archivée
 * @param {string} entityType - Type d'entité ('patients', 'users', 'devices')
 * @param {Function} onSuccess - Callback appelé après succès
 * @param {Function} onError - Callback appelé en cas d'erreur
 * @param {Function} invalidateCache - Fonction pour invalider le cache
 * @param {Function} refetch - Fonction pour recharger les données
 * @returns {Object} { restore, restoring, error }
 */
export function useEntityRestore(entityType, { onSuccess, onError, invalidateCache, refetch } = {}) {
  const { fetchWithAuth, API_URL } = useAuth()
  const [restoring, setRestoring] = useState(null)
  const [error, setError] = useState(null)

  const restore = useCallback(async (entity) => {
    if (!entity?.id) {
      setError('Entité invalide')
      return
    }

    try {
      setRestoring(entity.id)
      setError(null)

      const response = await fetchWithAuth(
        `${API_URL}/api.php/${entityType}/${entity.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_at: null })
        },
        { requiresAuth: true }
      )

      if (response.ok) {
        // Invalider le cache si fourni
        if (invalidateCache) {
          invalidateCache()
        }
        
        // Recharger les données si fourni
        if (refetch) {
          await refetch()
        }

        // Callback de succès
        if (onSuccess) {
          onSuccess(entity)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || 'Erreur lors de la restauration'
        setError(errorMessage)
        
        // Callback d'erreur
        if (onError) {
          onError(errorMessage, entity)
        } else {
          logger.error(`Erreur restauration ${entityType}:`, errorMessage)
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Erreur lors de la restauration'
      setError(errorMessage)
      
      // Callback d'erreur
      if (onError) {
        onError(errorMessage, entity)
      } else {
        logger.error(`Erreur restauration ${entityType}:`, err)
      }
    } finally {
      setRestoring(null)
    }
  }, [entityType, fetchWithAuth, API_URL, invalidateCache, refetch, onSuccess, onError])

  return {
    restore,
    restoring,
    error
  }
}

