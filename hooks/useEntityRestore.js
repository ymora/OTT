/**
 * Hook personnalisé pour restaurer des entités archivées (patients, users, devices)
 * Élimine la duplication de code pour la restauration
 * @module hooks/useEntityRestore
 */

import { useState, useCallback, useRef, useEffect } from 'react'
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
  
  // Utiliser useRef pour éviter les boucles infinies avec les callbacks
  const callbacksRef = useRef({ onSuccess, onError, invalidateCache, refetch })
  useEffect(() => {
    callbacksRef.current = { onSuccess, onError, invalidateCache, refetch }
  }, [onSuccess, onError, invalidateCache, refetch])

  const restore = useCallback(async (entity) => {
    if (!entity?.id) {
      setError('Entité invalide')
      return
    }

    try {
      setRestoring(entity.id)
      setError(null)

      // Pour les devices, utiliser la route spécifique /devices/{id}/restore
      // Pour les autres entités (users, patients), utiliser PATCH /entity/{id} avec deleted_at: null
      const endpoint = entityType === 'devices'
        ? `${API_URL}/api.php/${entityType}/${entity.id}/restore`
        : `${API_URL}/api.php/${entityType}/${entity.id}`

      const response = await fetchWithAuth(
        endpoint,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: entityType === 'devices' ? undefined : JSON.stringify({ deleted_at: null })
        },
        { requiresAuth: true }
      )

      if (response.ok) {
        // Invalider le cache si fourni
        if (callbacksRef.current.invalidateCache) {
          callbacksRef.current.invalidateCache()
        }
        
        // Recharger les données si fourni
        if (callbacksRef.current.refetch) {
          await callbacksRef.current.refetch()
        }

        // Callback de succès
        if (callbacksRef.current.onSuccess) {
          callbacksRef.current.onSuccess(entity)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || 'Erreur lors de la restauration'
        setError(errorMessage)
        
        // Callback d'erreur
        if (callbacksRef.current.onError) {
          callbacksRef.current.onError(errorMessage, entity)
        } else {
          logger.error(`Erreur restauration ${entityType}:`, errorMessage)
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Erreur lors de la restauration'
      setError(errorMessage)
      
      // Callback d'erreur
      if (callbacksRef.current.onError) {
        callbacksRef.current.onError(errorMessage, entity)
      } else {
        logger.error(`Erreur restauration ${entityType}:`, err)
      }
    } finally {
      setRestoring(null)
    }
  }, [entityType, fetchWithAuth, API_URL])

  return {
    restore,
    restoring,
    error
  }
}

