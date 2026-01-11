'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useApiData } from '@/hooks'
import { useAuth } from '@/contexts/AuthContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import SearchBar from '@/components/SearchBar'
import UserModal from '@/components/UserModal'

export default function UsersPage() {
  const { user, token } = useAuth() // Ajout pour debug
  console.log('Auth state:', { user: !!user, token: !!token }) // Debug
  
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [success, setSuccess] = useState('')
  const [actionError, setActionError] = useState('')
  
  const { data, loading, error, refetch } = useApiData([
    '/api.php/users'
  ], { requiresAuth: true })
  
  const allUsers = data?.users || []
  const roles = data?.roles || []
  
  const filteredUsers = useMemo(() => {
    if (!searchTerm) return allUsers
    
    const needle = searchTerm.toLowerCase()
    return allUsers.filter(user => {
      const haystack = `${user.first_name || ''} ${user.last_name || ''} ${user.email || ''} ${user.phone || ''} ${user.role_name || ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [allUsers, searchTerm])
  
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
  }

  const handleModalSave = async () => {
    try {
      setSuccess(editingItem ? 'Utilisateur modifié avec succès' : 'Utilisateur créé avec succès')
      await new Promise(resolve => setTimeout(resolve, 100))
      await refetch()
    } catch (err) {
      setActionError(err.message || 'Erreur lors de la sauvegarde')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">👥 Utilisateurs</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un utilisateur..."
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={openCreateModal}>
            ➕ Nouvel Utilisateur
          </button>
        </div>
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
                      {searchTerm 
                        ? 'Aucun utilisateur ne correspond à la recherche' 
                        : 'Aucun utilisateur'}
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, i) => (
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
                        }) : '-'}
                      </td>
                      <td className="table-cell py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(user)}
                            className="btn-sm btn-primary"
                            title="Modifier l'utilisateur"
                          >
                            ✏️
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
