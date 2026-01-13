/**
 * Hook personnalisé pour archiver des entités (patients, users, devices)
 * Élimine la duplication de code pour l'archivage
 * @module hooks/useEntityArchive
 */

import { useState, useCallback, useRef, useEffect } from 'react'
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
  
  // Utiliser useRef pour éviter les boucles infinies avec les callbacks
  const callbacksRef = useRef({ refetch, onSuccess, onError, invalidateCache, onCloseModal, editingItem, currentUser })
  useEffect(() => {
    callbacksRef.current = { refetch, onSuccess, onError, invalidateCache, onCloseModal, editingItem, currentUser }
  }, [refetch, onSuccess, onError, invalidateCache, onCloseModal, editingItem, currentUser])

  const archive = useCallback(async (entity) => {
    // Vérifier que l'entité a un ID valide (numérique, pas un ID temporaire)
    const hasValidId = entity?.id && 
      (typeof entity.id === 'number' || 
       (typeof entity.id === 'string' && /^\d+$/.test(entity.id) && !entity.id.startsWith('usb-'))) &&
      !entity?.isVirtual &&
      !entity?.isTemporary
    
    if (!hasValidId) {
      setError('Entité invalide ou non enregistrée')
      return
    }

    try {
      setArchiving(entity.id)
      setError(null)

      // Pour l'archivage, utiliser PATCH /:id/archive
      const entityId = entity.id
      const url = `/api.php/${entityType}/${entityId}/archive`

      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        url,
        { method: 'PATCH' },
        { requiresAuth: true }
      )

      if (response.success) {
        // Invalider le cache si fourni
        if (callbacksRef.current.invalidateCache) {
          callbacksRef.current.invalidateCache()
        }
        
        // Recharger les données si fourni
        if (callbacksRef.current.refetch) {
          await callbacksRef.current.refetch()
        }

        // Fermer le modal si l'élément archivé est en cours d'édition
        if (callbacksRef.current.onCloseModal && callbacksRef.current.editingItem && callbacksRef.current.editingItem.id === entity.id) {
          callbacksRef.current.onCloseModal()
        }

        // Callback de succès
        if (callbacksRef.current.onSuccess) {
          callbacksRef.current.onSuccess(entity)
        }
      } else {
        const errorMessage = response.error || 'Erreur lors de l\'archivage'
        setError(errorMessage)
        
        // Callback d'erreur
        if (callbacksRef.current.onError) {
          callbacksRef.current.onError(errorMessage, entity)
        } else {
          logger.error(`Erreur archivage ${entityType}:`, errorMessage)
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Erreur lors de l\'archivage'
      setError(errorMessage)
      
      // Callback d'erreur
      if (callbacksRef.current.onError) {
        callbacksRef.current.onError(errorMessage, entity)
      } else {
        logger.error(`Erreur archivage ${entityType}:`, err)
      }
    } finally {
      setArchiving(null)
    }
  }, [fetchWithAuth, API_URL, entityType])

  return {
    archive,
    archiving,
    error
  }
}

