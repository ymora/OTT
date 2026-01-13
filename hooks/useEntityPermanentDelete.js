/**
 * Hook personnalisé pour supprimer définitivement des entités (patients, users, devices)
 * Élimine la duplication de code pour la suppression définitive
 * @module hooks/useEntityPermanentDelete
 */

import { useState, useCallback, useRef, useEffect } from 'react'
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
  
  // Utiliser useRef pour éviter les boucles infinies avec les callbacks
  const callbacksRef = useRef({ refetch, onSuccess, onError, invalidateCache, onCloseModal, editingItem })
  useEffect(() => {
    callbacksRef.current = { refetch, onSuccess, onError, invalidateCache, onCloseModal, editingItem }
  }, [refetch, onSuccess, onError, invalidateCache, onCloseModal, editingItem])

  const permanentDelete = useCallback(async (entity) => {
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
        if (callbacksRef.current.invalidateCache) {
          callbacksRef.current.invalidateCache()
        }
        
        // Recharger les données si fourni
        if (callbacksRef.current.refetch) {
          await callbacksRef.current.refetch()
        }

        // Fermer le modal si l'élément supprimé est en cours d'édition
        if (callbacksRef.current.onCloseModal && callbacksRef.current.editingItem && callbacksRef.current.editingItem.id === entity.id) {
          callbacksRef.current.onCloseModal()
        }

        // Callback de succès
        if (callbacksRef.current.onSuccess) {
          callbacksRef.current.onSuccess(entity)
        }
      } else {
        const errorMessage = response.error || 'Erreur lors de la suppression'
        setError(errorMessage)
        
        // Callback d'erreur
        if (callbacksRef.current.onError) {
          callbacksRef.current.onError(errorMessage, entity)
        } else {
          logger.error(`Erreur suppression ${entityType}:`, errorMessage)
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'Erreur lors de la suppression'
      setError(errorMessage)
      
      // Callback d'erreur
      if (callbacksRef.current.onError) {
        callbacksRef.current.onError(errorMessage, entity)
      } else {
        logger.error(`Erreur suppression ${entityType}:`, err)
      }
    } finally {
      setDeleting(null)
    }
  }, [fetchWithAuth, API_URL, entityType])

  return {
    permanentDelete,
    deleting,
    error
  }
}

