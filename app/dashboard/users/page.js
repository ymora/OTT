'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState, useEffect } from 'react'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import SearchBar from '@/components/SearchBar'
import UserModal from '@/components/UserModal'
import logger from '@/lib/logger'

export default function UsersPage() {
  // États simples
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [success, setSuccess] = useState('')
  const [actionError, setActionError] = useState('')
  
  // Charger les données
  const { data, loading, error, refetch } = useApiData([
    '/api.php/users',
    '/api.php/roles'
  ], { requiresAuth: true })
  
  const allUsers = data?.users || []
  const roles = data?.roles || []
  
  // Filtrage
  const filteredUsers = useMemo(() => {
    if (!searchTerm) return allUsers
    
    const needle = searchTerm.toLowerCase()
    return allUsers.filter(user => {
      const haystack = `${user.first_name || ''} ${user.last_name || ''} ${user.email || ''} ${user.phone || ''} ${user.role_name || ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [allUsers, searchTerm])
  
  // Actions simples
  const openCreateModal = () => {
    setEditingItem(null)
    setShowModal(true)
  }
  
  const openEditModal = (user) => {
    setEditingItem(user)
    setShowModal(true)
  }
  
  const closeModal = () => {
    setShowModal(false)
    setEditingItem(null)
    setSuccess('')
    setActionError('')
  }
  
  const resetMessages = () => {
    setSuccess('')
    setActionError('')
  }

  const roleColors = {
    admin: 'bg-purple-100 text-purple-700',
    medecin: 'bg-green-100 text-green-700',
    technicien: 'bg-blue-100 text-blue-700',
    // viewer supprimé
  }

  const handleModalSave = async () => {
    try {
      setSuccess(editingItem ? 'Utilisateur modifié avec succès' : 'Utilisateur créé avec succès')
      // Attendre un peu pour s'assurer que la base de données est bien mise à jour
      // puis refetch pour recharger les données avec les notifications mises à jour
      await new Promise(resolve => setTimeout(resolve, 100))
      await refetch()
    } catch (err) {
      setActionError(err.message || 'Erreur lors de la sauvegarde')
      logger.error('Erreur sauvegarde utilisateur:', err)
    }
  }


  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">👥 Utilisateurs</h1>
      </div>

      {/* Recherche et Nouvel Utilisateur sur la même ligne */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un utilisateur..."
          />
        </div>
        <div className="flex items-center gap-2">
          <button 
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed" 
            onClick={openCreateModal}
            title="Créer un nouvel utilisateur"
          >
            ➕ Nouvel Utilisateur
          </button>
        </div>

      <div className="card">
        <ErrorMessage error={error} onRetry={refetch} />
        <ErrorMessage error={actionError} onClose={resetMessages} />
        <SuccessMessage message={success} onClose={resetMessages} />
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
                      {searchTerm 
                        ? 'Aucun utilisateur ne correspond à la recherche' 
                        : 'Aucun utilisateur'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, i) => {
                    return (
                    <tr 
                      key={user.id} 
                      className="table-row animate-slide-up hover:bg-gray-50 dark:hover:bg-gray-800"
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="table-cell py-3 px-4 font-medium">
                        {user.first_name} {user.last_name}
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
                        {userIsArchived ? (
                          <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">🗄️ Archivé</span>
                        ) : user.is_active ? (
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
                          {userIsArchived ? (
                            // Utilisateurs archivés : uniquement l'icône de restauration
                            <button
                              onClick={() => handleRestoreUser(user)}
                              disabled={restoringUser === user.id}
                              className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                              title="Restaurer l'utilisateur"
                            >
                              <span className="text-lg">{restoringUser === user.id ? '⏳' : '♻️'}</span>
                            </button>
                          ) : (
                            // Utilisateurs actifs : toutes les actions disponibles
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
        </div>
      </div>

      <UserModal
        isOpen={showModal}
        onClose={closeModal}
        editingItem={editingItem}
        type="user"
        onSave={handleModalSave}
        roles={roles}
      />

    </div>
  )
}
