'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiData, useFilter, useEntityModal } from '@/hooks'
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
  const [actionError, setActionError] = useState(null)
  const [success, setSuccess] = useState(null)
  
  // Utiliser le hook useEntityModal pour gérer le modal
  const { isOpen: showModal, editingItem, openCreate: openCreateModal, openEdit: openEditModal, close: closeModal } = useEntityModal()
  
  // Modal de suppression
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [userToDelete, setUserToDelete] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [restoringUser, setRestoringUser] = useState(null)

  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    [
      showArchived ? '/api.php/users?include_deleted=true' : '/api.php/users',
      '/api.php/roles'
    ],
    { requiresAuth: true }
  )

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

  // Fonctions de suppression
  const handleDeleteClick = (user) => {
    setUserToDelete(user)
    setShowDeleteModal(true)
  }
  
  const handleArchive = async () => {
    if (!userToDelete) return
    
    try {
      setDeleteLoading(true)
      setActionError(null)
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/users/${userToDelete.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      if (response.success) {
        setSuccess('✅ Utilisateur archivé avec succès')
        refetch()
        setShowDeleteModal(false)
        setUserToDelete(null)
        if (showModal && editingItem && editingItem.id === userToDelete.id) {
          closeModal()
        }
      } else {
        setActionError(response.error || 'Erreur lors de l\'archivage')
      }
    } catch (err) {
      setActionError(err.message || 'Erreur lors de l\'archivage')
      logger.error('Erreur archivage user:', err)
    } finally {
      setDeleteLoading(false)
    }
  }
  
  const handlePermanentDelete = async () => {
    if (!userToDelete) return
    
    try {
      setDeleteLoading(true)
      setActionError(null)
      const response = await fetchWithAuth(
        `${API_URL}/api.php/users/${userToDelete.id}?permanent=true`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        },
        { requiresAuth: true }
      )
      
      if (response.ok) {
        setSuccess('✅ Utilisateur supprimé définitivement')
        refetch()
        setShowDeleteModal(false)
        setUserToDelete(null)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setActionError(errorData.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      setActionError(err.message || 'Erreur lors de la suppression')
      logger.error('Erreur suppression user:', err)
    } finally {
      setDeleteLoading(false)
    }
  }
  
  // Restaurer un utilisateur archivé
  const handleRestoreUser = async (user) => {
    try {
      setRestoringUser(user.id)
      setActionError(null)
      const response = await fetchWithAuth(
        `${API_URL}/api.php/users/${user.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_at: null })
        },
        { requiresAuth: true }
      )
      
      if (response.ok) {
        setSuccess('✅ Utilisateur restauré avec succès !')
        await refetch()
        createTimeoutWithCleanup(() => setSuccess(null), 5000)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setActionError(errorData.error || 'Erreur lors de la restauration')
      }
    } catch (err) {
      setActionError(err.message || 'Erreur lors de la restauration')
      logger.error('Erreur restauration user:', err)
    } finally {
      setRestoringUser(null)
    }
  }
  
  // Fonction utilitaire pour créer un timeout avec cleanup
  const timeoutRefs = useRef([])
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId))
      timeoutRefs.current = []
    }
  }, [])
  
  const createTimeoutWithCleanup = (callback, delay) => {
    const timeoutId = setTimeout(() => {
      callback()
      timeoutRefs.current = timeoutRefs.current.filter(id => id !== timeoutId)
    }, delay)
    timeoutRefs.current.push(timeoutId)
    return timeoutId
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
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4">Nom</th>
                  <th className="text-left py-3 px-4">Rôle</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="text-left py-3 px-4">Téléphone</th>
                  <th className="text-left py-3 px-4">Statut</th>
                  <th className="text-left py-3 px-4">Dernière connexion</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-muted">
                      Aucun utilisateur trouvé
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, i) => {
                    const isArchived = !!user.deleted_at
                    return (
                    <tr 
                      key={user.id} 
                      className={`table-row animate-slide-up hover:bg-gray-50 dark:hover:bg-gray-800 ${isArchived ? 'opacity-60' : ''}`}
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="py-3 px-4 font-medium">
                        {user.first_name} {user.last_name}
                        {isArchived && (
                          <span className="ml-2 badge bg-gray-100 text-gray-600 text-xs">🗄️ Archivé</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${roleColors[user.role_name] || 'bg-gray-100 text-gray-700'}`}>
                          {user.role_name}
                        </span>
                      </td>
                      <td className="table-cell">{user.email}</td>
                      <td className="table-cell text-sm">
                        {user.phone || '-'}
                      </td>
                      <td className="py-3 px-4">
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
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {isArchived ? (
                            <button
                              className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                              onClick={() => handleRestoreUser(user)}
                              disabled={restoringUser === user.id}
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
                              <button
                                className={`p-2 rounded-lg transition-colors ${
                                  user.id === currentUser?.id 
                                    ? 'opacity-50 cursor-not-allowed' 
                                    : 'hover:bg-red-100'
                                }`}
                                onClick={() => handleDeleteClick(user)}
                                disabled={deleteLoading || currentUser?.role_name !== 'admin' || user.id === currentUser?.id}
                                title={currentUser?.role_name === 'admin' && user.id !== currentUser?.id ? "Supprimer l'utilisateur" : user.id === currentUser?.id ? "Vous ne pouvez pas supprimer votre propre compte" : "Réservé aux administrateurs"}
                              >
                                {user.id === currentUser?.id ? (
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
                                ) : (
                                  <span className="text-lg">{deleteLoading ? '⏳' : '🗑️'}</span>
                                )}
                              </button>
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

      {/* Modal de suppression unifié */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setUserToDelete(null)
        }}
        onConfirm={handleArchive}
        onSecondAction={currentUser?.role_name === 'admin' ? handlePermanentDelete : null}
        title={currentUser?.role_name === 'admin' ? '⚠️ Supprimer ou archiver ?' : 'Supprimer l\'utilisateur'}
        message={`Utilisateur : ${userToDelete?.first_name} ${userToDelete?.last_name}\n${userToDelete?.email}\n\n${
          currentUser?.role_name === 'admin'
            ? 'Choisissez une action :\n\n🗄️ Archiver : L\'utilisateur peut être restauré\n🗑️ Supprimer définitivement : IRRÉVERSIBLE'
            : 'Cette action supprimera l\'utilisateur.'
        }`}
        confirmText={currentUser?.role_name === 'admin' ? '🗄️ Archiver' : '🗑️ Supprimer'}
        secondActionText={currentUser?.role_name === 'admin' ? '🗑️ Supprimer définitivement' : null}
        variant={currentUser?.role_name === 'admin' ? 'warning' : 'danger'}
        secondActionVariant="danger"
        loading={deleteLoading}
      />

    </div>
  )
}

