/**
 * Hook unifié pour les pages d'entités (patients, users, devices)
 * Élimine la duplication entre les 3 pages
 * @module hooks/useEntityPage
 */

import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiData, useFilter, useEntityModal, useEntityRestore, useEntityArchive, useEntityPermanentDelete, useToggle, useAsyncState } from '@/hooks'
import { isArchived as isEntityArchived } from '@/lib/utils'

/**
 * Hook unifié pour les pages d'entités
 * @param {Object} config - Configuration
 * @param {string} config.entityType - Type d'entité ('patients', 'users', 'devices')
 * @param {string[]} config.additionalEndpoints - Endpoints supplémentaires à charger
 * @param {Function} config.searchFn - Fonction de recherche personnalisée
 * @returns {Object} État et fonctions unifiées
 */
export function useEntityPage(config) {
  const { entityType, additionalEndpoints = [], searchFn } = config
  const { user: currentUser, fetchWithAuth, API_URL } = useAuth()
  
  // Helper pour vérifier les permissions (unifié)
  const hasPermission = (permission) => {
    if (!permission) return true
    if (currentUser?.role_name === 'admin') return true
    return currentUser?.permissions?.includes(permission) || false
  }
  
  // Gestion des messages (unifié)
  const { success, error: actionError, setSuccess, setError: setActionError, reset: resetMessages } = useAsyncState()
  
  // Gestion du modal (unifié)
  const modal = useEntityModal()
  const { isOpen: showModal, editingItem, openCreate: openCreateModal, openEdit: openEditModal, close: closeModal } = modal
  
  // Toggle archives (unifié)
  const [showArchived, toggleShowArchived] = useToggle(false)
  
  // Charger les données (unifié)
  // Mémoriser additionalEndpoints pour éviter les re-renders
  const additionalEndpointsKey = useMemo(() => {
    return additionalEndpoints.join(',')
  }, [additionalEndpoints.join(',')])
  
  const endpoints = useMemo(() => {
    const baseEndpoint = `/api.php/${entityType}`
    const mainEndpoint = showArchived ? `${baseEndpoint}?include_deleted=true` : baseEndpoint
    return [mainEndpoint, ...additionalEndpoints]
  }, [entityType, showArchived, additionalEndpointsKey])
  
  const { data, loading, error, refetch, invalidateCache } = useApiData(
    endpoints,
    { requiresAuth: true }
  )
  
  // Note: useApiData gère déjà le rechargement automatique quand les endpoints changent
  // Pas besoin de useEffect supplémentaire qui pourrait causer des boucles infinies
  
  // Hooks d'actions unifiés
  const restore = useEntityRestore(entityType, {
    onSuccess: () => {
      setSuccess(`✅ ${entityType === 'patients' ? 'Patient' : entityType === 'users' ? 'Utilisateur' : 'Dispositif'} restauré avec succès`)
      // Si on était en mode archivé, basculer vers la vue normale pour voir l'élément restauré
      if (showArchived) {
        toggleShowArchived()
      }
    },
    onError: (errorMessage) => {
      setActionError(errorMessage)
    },
    invalidateCache,
    refetch
  })
  
  const archive = useEntityArchive({
    fetchWithAuth,
    API_URL,
    entityType,
    refetch,
    onSuccess: () => {
      setSuccess(`✅ ${entityType === 'patients' ? 'Patient' : entityType === 'users' ? 'Utilisateur' : 'Dispositif'} archivé avec succès`)
    },
    onError: (errorMessage) => {
      setActionError(errorMessage)
    },
    invalidateCache,
    currentUser,
    onCloseModal: closeModal,
    editingItem
  })
  
  const permanentDelete = useEntityPermanentDelete({
    fetchWithAuth,
    API_URL,
    entityType,
    refetch,
    onSuccess: () => {
      setSuccess(`✅ ${entityType === 'patients' ? 'Patient' : entityType === 'users' ? 'Utilisateur' : 'Dispositif'} supprimé définitivement`)
    },
    onError: (errorMessage) => {
      setActionError(errorMessage)
    },
    invalidateCache,
    onCloseModal: closeModal,
    editingItem
  })
  
  // Extraire les données (unifié)
  const allItems = data?.[entityType]?.[entityType] || []
  const items = useMemo(() => {
    return allItems.filter(item => !isEntityArchived(item))
  }, [allItems])
  
  const itemsToDisplay = showArchived ? allItems : items
  
  // Recherche (unifié)
  const filter = useFilter(itemsToDisplay, {
    searchFn: searchFn || ((items, term) => {
      const needle = term.toLowerCase()
      return items.filter(item => {
        const haystack = Object.values(item)
          .filter(v => typeof v === 'string')
          .join(' ')
          .toLowerCase()
        return haystack.includes(needle)
      })
    })
  })
  
  return {
    // Données
    allItems,
    items,
    itemsToDisplay,
    filteredItems: filter.filteredItems,
    searchTerm: filter.searchTerm,
    setSearchTerm: filter.setSearchTerm,
    
    // État
    loading,
    error,
    success,
    actionError,
    setSuccess,
    setActionError,
    resetMessages,
    
    // Archives
    showArchived,
    toggleShowArchived,
    
    // Modal
    showModal,
    editingItem,
    openCreateModal,
    openEditModal,
    closeModal,
    
    // Actions
    restore: restore.restore,
    restoring: restore.restoring,
    archive: archive.archive,
    archiving: archive.archiving,
    permanentDelete: permanentDelete.permanentDelete,
    deletingPermanent: permanentDelete.deleting,
    
    // Utilitaires
    hasPermission,
    isArchived: isEntityArchived,
    currentUser,
    fetchWithAuth,
    API_URL,
    refetch,
    invalidateCache,
    
    // Données supplémentaires (mémorisé pour éviter les re-renders)
    additionalData: useMemo(() => {
      return additionalEndpoints.reduce((acc, endpoint) => {
        const key = endpoint.split('/').pop().split('?')[0]
        acc[key] = data?.[key]?.[key] || []
        return acc
      }, {})
    }, [additionalEndpointsKey, data])
  }
}
