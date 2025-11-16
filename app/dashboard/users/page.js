'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

const defaultFormState = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  password: '',
  role_id: ''
}

const defaultNotificationPrefs = {
  email_enabled: true,
  sms_enabled: false,
  push_enabled: true,
  phone_number: '',
  notify_battery_low: true,
  notify_device_offline: true,
  notify_abnormal_flow: true,
  notify_new_patient: false
}

export default function UsersPage() {
  const { fetchWithAuth, API_URL, user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showUserModal, setShowUserModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null) // null = création, objet = modification
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    password: '',
    role_id: '',
    is_active: true
  })
  const [notificationPrefs, setNotificationPrefs] = useState(defaultNotificationPrefs)
  const [loadingNotifPrefs, setLoadingNotifPrefs] = useState(false)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const loadUsers = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/users', {}, { requiresAuth: true })
      setUsers(data.users || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [API_URL, fetchWithAuth])


  const loadRoles = useCallback(async () => {
    try {
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/roles', {}, { requiresAuth: true })
      setRoles(data.roles || [])
    } catch (err) {
      console.error(err)
    }
  }, [API_URL, fetchWithAuth])

  useEffect(() => {
    loadUsers()
    loadRoles()
  }, [loadUsers, loadRoles])

  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      if (searchTerm) {
        const needle = searchTerm.toLowerCase()
        const haystack = `${user.first_name || ''} ${user.last_name || ''} ${user.email || ''} ${user.phone || ''} ${user.role_name || ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [users, searchTerm])

  const roleColors = {
    admin: 'bg-purple-100 text-purple-700',
    medecin: 'bg-green-100 text-green-700',
    technicien: 'bg-blue-100 text-blue-700',
    viewer: 'bg-gray-100 text-gray-700',
  }

  const canSubmit = useMemo(() => {
    return (
      formData.first_name.trim().length > 1 &&
      formData.last_name.trim().length > 1 &&
      (!editingUser || formData.email ? /\S+@\S+\.\S+/.test(formData.email) : true) &&
      (editingUser ? true : formData.password.length >= 6) &&
      Boolean(formData.role_id)
    )
  }, [formData, editingUser])

  const openCreateModal = () => {
    setEditingUser(null)
    setFormData({
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      password: '',
      role_id: '',
      is_active: true
    })
    setNotificationPrefs(defaultNotificationPrefs)
    setFormError(null)
    setShowUserModal(true)
  }

  const closeUserModal = () => {
    if (saving) return
    setShowUserModal(false)
    setEditingUser(null)
    setFormError(null)
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmitUser = async (e) => {
    e.preventDefault()
    setSaving(true)
    setFormError(null)
    
    try {
      if (editingUser) {
        // Modification
        const payload = {
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          role_id: formData.role_id ? parseInt(formData.role_id, 10) : undefined,
          is_active: formData.is_active,
          phone: formData.phone || null
        }
        if (formData.password.trim().length >= 6) {
          payload.password = formData.password
        }
        
        await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/users/${editingUser.id}`,
          {
            method: 'PUT',
            body: JSON.stringify(payload)
          },
          { requiresAuth: true }
        )
        
                // Sauvegarder les préférences de notifications (avec le téléphone synchronisé)
                try {
                  await fetchJson(
                    fetchWithAuth,
                    API_URL,
                    `/api.php/users/${editingUser.id}/notifications`,
                    {
                      method: 'PUT',
                      body: JSON.stringify({
                        ...notificationPrefs,
                        phone_number: formData.phone || notificationPrefs.phone_number || ''
                      })
                    },
                    { requiresAuth: true }
                  )
                } catch (notifErr) {
                  console.warn('Erreur sauvegarde notifications:', notifErr)
                }
      } else {
        // Création
        const payload = {
          ...formData,
          role_id: parseInt(formData.role_id, 10),
          phone: formData.phone || null
        }
        const response = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/users',
          {
            method: 'POST',
            body: JSON.stringify(payload)
          },
          { requiresAuth: true }
        )
        
                // Sauvegarder les préférences de notifications pour le nouvel utilisateur (avec le téléphone synchronisé)
                if (response.user_id) {
                  try {
                    await fetchJson(
                      fetchWithAuth,
                      API_URL,
                      `/api.php/users/${response.user_id}/notifications`,
                      {
                        method: 'PUT',
                        body: JSON.stringify({
                          ...notificationPrefs,
                          phone_number: formData.phone || notificationPrefs.phone_number || ''
                        })
                      },
                      { requiresAuth: true }
                    )
                  } catch (notifErr) {
                    console.warn('Erreur sauvegarde notifications:', notifErr)
                  }
                }
      }
      
      setShowUserModal(false)
      setEditingUser(null)
      await loadUsers()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = async (user) => {
    setEditingUser(user)
    setFormData({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      email: user.email || '',
      phone: user.phone || '',
      password: '',
      role_id: roles.find(r => r.name === user.role_name)?.id || '',
      is_active: Boolean(user.is_active)
    })
    setFormError(null)
    setShowUserModal(true)
    
    // Charger les préférences de notifications
    try {
      setLoadingNotifPrefs(true)
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/users/${user.id}/notifications`,
        {},
        { requiresAuth: true }
      )
      const prefs = data.preferences || defaultNotificationPrefs
      // Utiliser le téléphone de l'utilisateur ou celui des préférences
      const phoneValue = user.phone || prefs.phone_number || ''
      setNotificationPrefs({
        ...prefs,
        phone_number: phoneValue
      })
      // Synchroniser formData.phone
      setFormData(prev => ({
        ...prev,
        phone: phoneValue
      }))
    } catch (err) {
      // Si pas de préférences, utiliser les valeurs par défaut
      const phoneValue = user.phone || ''
      setNotificationPrefs({
        ...defaultNotificationPrefs,
        phone_number: phoneValue
      })
      setFormData(prev => ({
        ...prev,
        phone: phoneValue
      }))
    } finally {
      setLoadingNotifPrefs(false)
    }
  }

  const handleDeleteUser = async (userToDelete) => {
    if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer l'utilisateur "${userToDelete.first_name} ${userToDelete.last_name}" ?\n\nCette action est irréversible.`)) {
      return
    }

    try {
      setDeleteLoading(true)
      setError(null)
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/users/${userToDelete.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      if (response.success) {
        loadUsers()
        if (showUserModal && editingUser) {
          closeUserModal()
        }
      } else {
        setError(response.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      // Extraire le message d'erreur de la réponse si disponible
      let errorMessage = 'Erreur lors de la suppression de l\'utilisateur'
      if (err.message) {
        errorMessage = err.message
      } else if (err.error) {
        errorMessage = err.error
      }
      setError(errorMessage)
      console.error('Erreur suppression utilisateur:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleDeleteUserFromEdit = async () => {
    if (!editingUser) return
    await handleDeleteUser(editingUser)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">👥 Utilisateurs</h1>
      </div>

      {/* Recherche et Nouvel Utilisateur sur la même ligne */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            className="input"
            placeholder="Rechercher un utilisateur..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
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
        {error && (
          <div className="alert alert-warning mb-4">
            <strong>Erreur API :</strong> {error}
          </div>
        )}
        {loading ? (
          <div className="animate-shimmer h-64"></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4">Nom</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="text-left py-3 px-4">Rôle</th>
                  <th className="text-left py-3 px-4">Téléphone</th>
                  <th className="text-left py-3 px-4">Statut</th>
                  <th className="text-left py-3 px-4">Dernière connexion</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-gray-500">
                      Aucun utilisateur trouvé
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((user, i) => (
                    <tr 
                      key={user.id} 
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors animate-slide-up"
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="py-3 px-4 font-medium">{user.first_name} {user.last_name}</td>
                      <td className="py-3 px-4 text-gray-600">{user.email}</td>
                      <td className="py-3 px-4">
                        <span className={`badge ${roleColors[user.role_name] || 'bg-gray-100 text-gray-700'}`}>
                          {user.role_name}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {user.phone || '-'}
                      </td>
                      <td className="py-3 px-4">
                        {user.is_active ? (
                          <span className="badge badge-success">✅ Actif</span>
                        ) : (
                          <span className="badge text-gray-600 bg-gray-100">❌ Inactif</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {user.last_login ? new Date(user.last_login).toLocaleString('fr-FR', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        }) : 'Jamais'}
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
                            onClick={() => handleDeleteUser(user)}
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

      {showUserModal && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 animate-scale-in my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  {editingUser ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
                </h2>
                <p className="text-sm text-gray-500">
                  {editingUser ? editingUser.email : 'Créer un accès avec un rôle défini'}
                </p>
              </div>
              <button className="text-gray-500 hover:text-gray-700" onClick={closeUserModal} disabled={saving || deleteLoading}>
                ✕
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleSubmitUser}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm font-medium text-gray-700">
                  Prénom
                  <input
                    type="text"
                    name="first_name"
                    value={formData.first_name}
                    onChange={handleInputChange}
                    className="input mt-1"
                    required
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Nom
                  <input
                    type="text"
                    name="last_name"
                    value={formData.last_name}
                    onChange={handleInputChange}
                    className="input mt-1"
                    required
                  />
                </label>
              </div>
              
              <label className="text-sm font-medium text-gray-700 w-full">
                Email
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  className="input mt-1"
                  required
                />
              </label>

              <label className="text-sm font-medium text-gray-700 w-full">
                Téléphone (optionnel, pour SMS)
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone || ''}
                  onChange={handleInputChange}
                  className="input mt-1"
                  placeholder="+33612345678"
                />
              </label>
              
              <label className="text-sm font-medium text-gray-700 w-full">
                Rôle
                <select
                  name="role_id"
                  value={formData.role_id}
                  onChange={handleInputChange}
                  className="input mt-1"
                  required
                >
                  <option value="">Choisir un rôle…</option>
                  {roles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </label>

              {editingUser && (
                <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                  <input
                    type="checkbox"
                    name="is_active"
                    checked={formData.is_active}
                    onChange={handleInputChange}
                    className="form-checkbox h-4 w-4 text-primary-600"
                  />
                  Compte actif
                </label>
              )}

              <label className="text-sm font-medium text-gray-700 w-full">
                {editingUser ? 'Nouveau mot de passe (optionnel, 6+ caractères)' : 'Mot de passe (6+ caractères)'}
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="input mt-1"
                  required={!editingUser}
                  minLength={6}
                />
              </label>

              {formError && (
                <div className="alert alert-error">
                  <strong>Erreur :</strong> {formError}
                </div>
              )}

              {/* Section Notifications */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold mb-3">📧 Notifications</h3>
                
                {editingUser && loadingNotifPrefs ? (
                  <div className="text-sm text-gray-500">Chargement des préférences...</div>
                ) : (
                  <div className="space-y-4">
                    {/* Canaux de notification */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Canaux activés</label>
                      <div className="grid grid-cols-3 gap-3">
                        <label className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.email_enabled}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, email_enabled: e.target.checked }))}
                            className="form-checkbox"
                          />
                          <span className="text-sm">✉️ Email</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.sms_enabled}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, sms_enabled: e.target.checked }))}
                            className="form-checkbox"
                          />
                          <span className="text-sm">📱 SMS</span>
                        </label>
                        <label className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.push_enabled}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, push_enabled: e.target.checked }))}
                            className="form-checkbox"
                          />
                          <span className="text-sm">🔔 Push</span>
                        </label>
                      </div>
                    </div>

                    {/* Types d'alertes */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Types d&apos;alertes</label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.notify_battery_low}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_battery_low: e.target.checked }))}
                            className="form-checkbox"
                          />
                          🔋 Batterie faible
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.notify_device_offline}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_device_offline: e.target.checked }))}
                            className="form-checkbox"
                          />
                          📴 Dispositif hors ligne
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.notify_abnormal_flow}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_abnormal_flow: e.target.checked }))}
                            className="form-checkbox"
                          />
                          ⚠️ Débit anormal
                        </label>
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={notificationPrefs.notify_new_patient}
                            onChange={(e) => setNotificationPrefs(prev => ({ ...prev, notify_new_patient: e.target.checked }))}
                            className="form-checkbox"
                          />
                          👤 Nouveau patient
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                {editingUser && (
                  <button
                    type="button"
                    className="text-red-600 hover:text-red-700 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleDeleteUserFromEdit}
                    disabled={saving || deleteLoading || currentUser?.role_name !== 'admin' || editingUser?.id === currentUser?.id}
                    title={currentUser?.role_name === 'admin' && editingUser?.id !== currentUser?.id ? "Supprimer l'utilisateur" : editingUser?.id === currentUser?.id ? "Vous ne pouvez pas supprimer votre propre compte" : "Réservé aux administrateurs"}
                  >
                    {deleteLoading ? 'Suppression…' : '🗑️ Supprimer'}
                  </button>
                )}
                <div className={`flex items-center gap-3 ${editingUser ? '' : 'ml-auto'}`}>
                  <button type="submit" className="btn-primary" disabled={saving || deleteLoading || (!editingUser && !canSubmit)}>
                    {saving ? (editingUser ? 'Enregistrement…' : 'Création…') : (editingUser ? 'Enregistrer' : 'Créer')}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}

