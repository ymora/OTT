'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiData, useFilter, useEntityModal, useEntityRestore, useEntityArchive, useEntityPermanentDelete } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import SearchBar from '@/components/SearchBar'
import UserPatientModal from '@/components/UserPatientModal'
import ConfirmModal from '@/components/ConfirmModal'
import { isTrue } from '@/lib/utils'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

export default function UsersPage() {
  const { fetchWithAuth, API_URL, user: currentUser } = useAuth()
  
  // Helper pour vérifier les permissions
  const hasPermission = (permission) => {
    if (!permission) return true
    if (currentUser?.role_name === 'admin') return true
    return currentUser?.permissions?.includes(permission) || false
  }
  const [actionError, setActionError] = useState(null)
  const [success, setSuccess] = useState(null)
  
  // Utiliser le hook useEntityModal pour gérer le modal
  const { isOpen: showModal, editingItem, openCreate: openCreateModal, openEdit: openEditModal, close: closeModal } = useEntityModal()
  
  // Modal de suppression
  // Plus de modal - actions directes
  const [showArchived, setShowArchived] = useState(false)

  // Charger les données avec useApiData
  // Le hook useApiData se recharge automatiquement quand l'endpoint change (showArchived)
  // Pas besoin de useEffect supplémentaire car useApiData détecte le changement d'endpoint via endpointsKey
  const { data, loading, error, refetch, invalidateCache } = useApiData(
    useMemo(() => [
      showArchived ? '/api.php/users?include_deleted=true' : '/api.php/users',
      '/api.php/roles'
    ], [showArchived]),
    { requiresAuth: true }
  )

  // Utiliser le hook unifié pour la restauration
  const { restore: handleRestoreUser, restoring: restoringUser } = useEntityRestore('users', {
    onSuccess: () => {
      setSuccess('✅ Utilisateur restauré avec succès')
    },
    onError: (errorMessage) => {
      setActionError(errorMessage)
    },
    invalidateCache,
    refetch
  })

  // Utiliser le hook unifié pour l'archivage
  const { archive: handleArchive, archiving } = useEntityArchive({
    fetchWithAuth,
    API_URL,
    entityType: 'users',
    refetch,
    onSuccess: () => {
      setSuccess('✅ Utilisateur archivé avec succès')
    },
    onError: (errorMessage) => {
      setActionError(errorMessage)
    },
    invalidateCache,
    currentUser,
    onCloseModal: closeModal,
    editingItem
  })

  // Utiliser le hook unifié pour la suppression définitive
  const { permanentDelete: handlePermanentDelete, deleting: deletingPermanent } = useEntityPermanentDelete({
    fetchWithAuth,
    API_URL,
    entityType: 'users',
    refetch,
    onSuccess: () => {
      setSuccess('✅ Utilisateur supprimé définitivement')
    },
    onError: (errorMessage) => {
      setActionError(errorMessage)
    },
    invalidateCache,
    onCloseModal: closeModal,
    editingItem
  })

  const allUsers = data?.users?.users || []
  const roles = data?.roles?.roles || []
  
  // Séparer les utilisateurs actifs et archivés
  const users = useMemo(() => {
    return allUsers.filter(u => !u.deleted_at)
  }, [allUsers])
  
  const archivedUsers = useMemo(() => {
    return allUsers.filter(u => u.deleted_at)
  }, [allUsers])

  // Utiliser useFilter pour la recherche
  const usersToDisplay = showArchived ? allUsers : users
  const {
    searchTerm,
    setSearchTerm,
    filteredItems: filteredUsers
  } = useFilter(usersToDisplay, {
    searchFn: (items, term) => {
      const needle = term.toLowerCase()
      return items.filter(user => {
        const haystack = `${user.first_name || ''} ${user.last_name || ''} ${user.email || ''} ${user.phone || ''} ${user.role_name || ''}`.toLowerCase()
        return haystack.includes(needle)
      })
      }
    })

  const roleColors = {
    admin: 'bg-purple-100 text-purple-700',
    medecin: 'bg-green-100 text-green-700',
    technicien: 'bg-blue-100 text-blue-700',
    // viewer supprimé
  }

  const handleModalSave = async () => {
    setSuccess(editingItem ? 'Utilisateur modifié avec succès' : 'Utilisateur créé avec succès')
    // Attendre un peu pour s'assurer que la base de données est bien mise à jour
    // puis refetch pour recharger les données avec les notifications mises à jour
    await new Promise(resolve => setTimeout(resolve, 100))
    await refetch()
  }


  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">👥 Utilisateurs</h1>
      </div>

      {/* Recherche, Toggle Archives et Nouvel Utilisateur sur la même ligne */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un utilisateur..."
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              🗄️ Afficher les archives
            </span>
          </label>
        </div>
        <button 
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed" 
          onClick={openCreateModal}
          disabled={currentUser?.role_name !== 'admin'}
          title={currentUser?.role_name === 'admin' ? "Créer un nouvel utilisateur" : "Réservé aux administrateurs"}
        >
          ➕ Nouvel Utilisateur
        </button>
      </div>

      <div className="card">
        <ErrorMessage error={error} onRetry={refetch} />
        <ErrorMessage error={actionError} onClose={() => setActionError(null)} />
        <SuccessMessage message={success} onClose={() => setSuccess(null)} />
        {loading ? (
          <LoadingSpinner size="lg" text="Chargement des utilisateurs..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Nom</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Rôle</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Email</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Téléphone</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Statut</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Dernière connexion</th>
                  <th className="text-right py-3 px-4 text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-gray-500 dark:text-gray-400">
                      Aucun utilisateur trouvé
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, i) => {
                    const isArchived = user.deleted_at !== null && user.deleted_at !== undefined && user.deleted_at !== ''
                    return (
                    <tr 
                      key={user.id} 
                      className={`table-row animate-slide-up hover:bg-gray-50 dark:hover:bg-gray-800 ${isArchived ? 'opacity-60' : ''}`}
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="table-cell py-3 px-4 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{user.first_name} {user.last_name}</span>
                          {isArchived && (
                            <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">🗄️ Archivé</span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell py-3 px-4">
                        <span className={`badge ${roleColors[user.role_name] || 'bg-gray-100 text-gray-700'}`}>
                          {user.role_name}
                        </span>
                      </td>
                      <td className="table-cell">{user.email}</td>
                      <td className="table-cell text-sm">
                        {user.phone || '-'}
                      </td>
                      <td className="table-cell py-3 px-4">
                        {user.is_active ? (
                          <span className="badge badge-success">✅ Actif</span>
                        ) : (
                          <span className="badge text-gray-600 bg-gray-100">❌ Inactif</span>
                        )}
                      </td>
                      <td className="table-cell text-sm">
                        {user.last_login ? new Date(user.last_login).toLocaleString('fr-FR', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        }) : 'Jamais'}
                      </td>
                      <td className="table-cell py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {isArchived ? (
                            <button
                              onClick={() => handleRestoreUser(user)}
                              disabled={restoringUser === user.id}
                              className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                              title="Restaurer l'utilisateur"
                            >
                              <span className="text-lg">{restoringUser === user.id ? '⏳' : '♻️'}</span>
                            </button>
                          ) : (
                            <>
                              <button
                                className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                onClick={() => openEditModal(user)}
                                title="Modifier l'utilisateur"
                              >
                                <span className="text-lg">✏️</span>
                              </button>
                              {user.id !== currentUser?.id && hasPermission('users.manage') && (
                                <>
                                  {/* Administrateurs : Archive + Suppression définitive */}
                                  {currentUser?.role_name === 'admin' ? (
                                    <>
                                      <button
                                        className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                        onClick={() => handleArchive(user)}
                                        disabled={archiving === user.id}
                                        title="Archiver l'utilisateur"
                                      >
                                        <span className="text-lg">{archiving === user.id ? '⏳' : '🗄️'}</span>
                                      </button>
                                      <button
                                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                        onClick={() => handlePermanentDelete(user)}
                                        disabled={deletingPermanent === user.id}
                                        title="Supprimer définitivement l'utilisateur"
                                      >
                                        <span className="text-lg">{deletingPermanent === user.id ? '⏳' : '🗑️'}</span>
                                      </button>
                                    </>
                                  ) : (
                                    /* Non-administrateurs : Archive uniquement (pas de suppression définitive) */
                                    <button
                                      className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                      onClick={() => handleArchive(user)}
                                      disabled={archiving === user.id}
                                      title="Archiver l'utilisateur"
                                    >
                                      <span className="text-lg">{archiving === user.id ? '⏳' : '🗄️'}</span>
                                    </button>
                                  )}
                                </>
                              )}
                              {user.id === currentUser?.id && (
                                <button
                                  className="p-2 opacity-50 cursor-not-allowed rounded-lg"
                                  disabled
                                  title="Vous ne pouvez pas supprimer votre propre compte"
                                >
                                  <span className="text-lg relative inline-block">
                                    <span className="text-red-500">🗑️</span>
                                    <span 
                                      className="absolute top-0 left-0 right-0 bottom-0 flex items-center justify-center text-red-600 text-lg font-bold leading-none"
                                      style={{
                                        textShadow: '0 0 2px white, 0 0 2px white'
                                      }}
                                    >
                                      ✖
                                    </span>
                                  </span>
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserPatientModal
        isOpen={showModal}
        onClose={closeModal}
        editingItem={editingItem}
        type="user"
        onSave={handleModalSave}
        fetchWithAuth={fetchWithAuth}
        API_URL={API_URL}
        roles={roles}
        currentUser={currentUser}
      />

      {/* Plus de modal - actions directes selon le rôle */}

    </div>
  )
}

