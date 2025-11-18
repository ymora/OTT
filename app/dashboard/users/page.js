'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData, useFilter } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import SearchBar from '@/components/SearchBar'
import UserPatientModal from '@/components/UserPatientModal'
import { isTrue } from '@/lib/utils'

export default function UsersPage() {
  const { fetchWithAuth, API_URL, user: currentUser } = useAuth()
  const [actionError, setActionError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    ['/api.php/users', '/api.php/roles'],
    { requiresAuth: true }
  )

  const users = data?.users?.users || []
  const roles = data?.roles?.roles || []

  // Utiliser useFilter pour la recherche
  const {
    searchTerm,
    setSearchTerm,
    filteredItems: filteredUsers
  } = useFilter(users, {
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
  }

  const handleModalSave = async () => {
    setSuccess(editingItem ? 'Utilisateur modifié avec succès' : 'Utilisateur créé avec succès')
    await refetch()
  }

  const handleDelete = async (userToDelete) => {
    if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer l'utilisateur "${userToDelete.first_name} ${userToDelete.last_name}" ?\n\nCette action est irréversible.`)) {
      return
    }

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
        setSuccess('Utilisateur supprimé avec succès')
        refetch()
        if (showModal && editingItem && editingItem.id === userToDelete.id) {
          closeModal()
        }
      } else {
        setActionError(response.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      // Extraire le message d'erreur de la réponse si disponible
      let errorMessage = 'Erreur lors de la suppression de l\'utilisateur'
      if (err.message) {
        errorMessage = err.message
      } else if (err.error) {
        errorMessage = err.error
      }
      setActionError(errorMessage)
      console.error('Erreur suppression utilisateur:', err)
    } finally {
      setDeleteLoading(false)
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
                  <th className="text-left py-3 px-4">Notifications</th>
                  <th className="text-left py-3 px-4">Types d'alertes</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="py-8 text-center text-muted">
                      Aucun utilisateur trouvé
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, i) => (
                    <tr 
                      key={user.id} 
                      className="table-row animate-slide-up"
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="py-3 px-4 font-medium">{user.first_name} {user.last_name}</td>
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
                        <div className="flex items-center gap-2">
                          {isTrue(user.email_enabled) ? (
                            <span className="text-lg" title="Email activé">✉️</span>
                          ) : (
                            <span className="text-lg opacity-40 grayscale" title="Email désactivé">✉️</span>
                          )}
                          {isTrue(user.sms_enabled) ? (
                            <span className="text-lg" title="SMS activé">📱</span>
                          ) : (
                            <span className="text-lg opacity-40 grayscale" title="SMS désactivé">📱</span>
                          )}
                          {isTrue(user.push_enabled) ? (
                            <span className="text-lg" title="Push activé">🔔</span>
                          ) : (
                            <span className="text-lg opacity-40 grayscale" title="Push désactivé">🔔</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {isTrue(user.notify_battery_low) && (
                            <span className="text-xs" title="Batterie faible">🔋</span>
                          )}
                          {isTrue(user.notify_device_offline) && (
                            <span className="text-xs" title="Dispositif hors ligne">📴</span>
                          )}
                          {isTrue(user.notify_abnormal_flow) && (
                            <span className="text-xs" title="Débit anormal">⚠️</span>
                          )}
                          {isTrue(user.notify_new_patient) && (
                            <span className="text-xs" title="Nouveau patient">👤</span>
                          )}
                          {!isTrue(user.notify_battery_low) && 
                           !isTrue(user.notify_device_offline) && 
                           !isTrue(user.notify_abnormal_flow) && 
                           !isTrue(user.notify_new_patient) && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={() => openEditModal(user)}
                            title="Modifier l'utilisateur"
                          >
                            <span className="text-lg">✏️</span>
                          </button>
                          <button
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                            onClick={() => handleDelete(user)}
                            disabled={deleteLoading || currentUser?.role_name !== 'admin' || user.id === currentUser?.id}
                            title={currentUser?.role_name === 'admin' && user.id !== currentUser?.id ? "Supprimer l'utilisateur" : user.id === currentUser?.id ? "Vous ne pouvez pas supprimer votre propre compte" : "Réservé aux administrateurs"}
                          >
                            <span className="text-lg">{deleteLoading ? '⏳' : '🗑️'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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
      />

    </div>
  )
}

