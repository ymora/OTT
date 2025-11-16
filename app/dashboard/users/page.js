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

export default function UsersPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [formData, setFormData] = useState(defaultFormState)
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [editForm, setEditForm] = useState({
    first_name: '',
    last_name: '',
    role_id: '',
    is_active: true,
    password: '',
    phone: ''
  })
  const [notificationPrefs, setNotificationPrefs] = useState({
    email_enabled: true,
    sms_enabled: false,
    push_enabled: true,
    phone_number: '',
    notify_battery_low: true,
    notify_device_offline: true,
    notify_abnormal_flow: true,
    notify_new_patient: false
  })
  const [loadingNotifPrefs, setLoadingNotifPrefs] = useState(false)
  const [editError, setEditError] = useState(null)
  const [editSaving, setEditSaving] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)

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
      const matchesSearch = searchTerm.toLowerCase().split(' ').every(term =>
        (user.first_name?.toLowerCase().includes(term)) ||
        (user.last_name?.toLowerCase().includes(term)) ||
        (user.email?.toLowerCase().includes(term)) ||
        (user.phone?.toLowerCase().includes(term))
      )

      const matchesRole = roleFilter === 'all' || user.role_name === roleFilter
      const matchesStatus = statusFilter === 'all' ||
        (statusFilter === 'active' && user.is_active) ||
        (statusFilter === 'inactive' && !user.is_active)

      return matchesSearch && matchesRole && matchesStatus
    })
  }, [users, searchTerm, roleFilter, statusFilter])

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
      /\S+@\S+\.\S+/.test(formData.email) &&
      formData.password.length >= 6 &&
      Boolean(formData.role_id)
    )
  }, [formData])

  const openModal = () => {
    setFormData(defaultFormState)
    setFormError(null)
    setShowCreateModal(true)
  }

  const closeModal = () => {
    if (saving) return
    setShowCreateModal(false)
    setFormError(null)
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    setFormError(null)
    try {
      const payload = {
        ...formData,
        role_id: parseInt(formData.role_id, 10)
      }
      await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/users',
        {
          method: 'POST',
          body: JSON.stringify(payload)
        },
        { requiresAuth: true }
      )
      setShowCreateModal(false)
      setFormData(defaultFormState)
      await loadUsers()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const openEditModal = async (user) => {
    setEditingUser(user)
    setEditForm({
      first_name: user.first_name || '',
      last_name: user.last_name || '',
      role_id: roles.find(r => r.name === user.role_name)?.id || '',
      is_active: Boolean(user.is_active),
      password: '',
      phone: user.phone || ''
    })
    setEditError(null)
    setShowEditModal(true)
    
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
      setNotificationPrefs(data.preferences || {
        email_enabled: true,
        sms_enabled: false,
        push_enabled: true,
        phone_number: user.phone || '',
        notify_battery_low: true,
        notify_device_offline: true,
        notify_abnormal_flow: true,
        notify_new_patient: false
      })
    } catch (err) {
      // Si pas de préférences, utiliser les valeurs par défaut
      setNotificationPrefs({
        email_enabled: true,
        sms_enabled: false,
        push_enabled: true,
        phone_number: user.phone || '',
        notify_battery_low: true,
        notify_device_offline: true,
        notify_abnormal_flow: true,
        notify_new_patient: false
      })
    } finally {
      setLoadingNotifPrefs(false)
    }
  }

  const closeEditModal = () => {
    if (editSaving || deleteLoading) return
    setShowEditModal(false)
    setEditingUser(null)
    setEditError(null)
  }

  const handleEditInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setEditForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editingUser) return
    setEditSaving(true)
    setEditError(null)
    try {
      // Sauvegarder les données utilisateur
      const payload = {
        first_name: editForm.first_name,
        last_name: editForm.last_name,
        role_id: editForm.role_id ? parseInt(editForm.role_id, 10) : undefined,
        is_active: editForm.is_active,
        phone: editForm.phone || null
      }
      if (editForm.password.trim().length >= 6) {
        payload.password = editForm.password
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
      
      // Sauvegarder les préférences de notifications
      try {
        await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/users/${editingUser.id}/notifications`,
          {
            method: 'PUT',
            body: JSON.stringify(notificationPrefs)
          },
          { requiresAuth: true }
        )
      } catch (notifErr) {
        console.warn('Erreur sauvegarde notifications:', notifErr)
        // Ne pas bloquer la sauvegarde si les notifications échouent
      }
      
      setShowEditModal(false)
      setEditingUser(null)
      await loadUsers()
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!editingUser) return
    const confirmed = window.confirm(`Supprimer définitivement ${editingUser.first_name} ${editingUser.last_name} ?`)
    if (!confirmed) return
    setDeleteLoading(true)
    setEditError(null)
    try {
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/users/${editingUser.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      setShowEditModal(false)
      setEditingUser(null)
      await loadUsers()
    } catch (err) {
      setEditError(err.message)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">👥 Utilisateurs</h1>
          <p className="text-gray-600 mt-1">Gestion des accès et permissions</p>
        </div>
        <button className="btn-primary" onClick={openModal}>
          ➕ Nouvel Utilisateur
        </button>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'Tous les rôles' },
            ...roles.map(r => ({ id: r.name, label: r.name }))
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setRoleFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                roleFilter === tab.id
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'Tous' },
            { id: 'active', label: 'Actifs' },
            { id: 'inactive', label: 'Inactifs' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                statusFilter === tab.id
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="🔍 Rechercher par nom, email, téléphone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full"
          />
        </div>
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
                          onClick={() => {
                            setSelectedUser(user)
                            setShowDetailsModal(true)
                          }}
                          title="Voir les détails"
                        >
                          <span className="text-lg">👁️</span>
                        </button>
                        <button
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          onClick={() => openEditModal(user)}
                          title="Modifier l'utilisateur"
                        >
                          <span className="text-lg">✏️</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Nouvel utilisateur</h2>
                <p className="text-sm text-gray-500">Créer un accès avec un rôle défini</p>
              </div>
              <button className="text-gray-500 hover:text-gray-700" onClick={closeModal} disabled={saving}>
                ✕
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleCreateUser}>
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
                Mot de passe (6+ caractères)
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="input mt-1"
                  required
                  minLength={6}
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

              {formError && (
                <div className="alert alert-error">
                  <strong>Erreur :</strong> {formError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={closeModal} disabled={saving}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={!canSubmit || saving}>
                  {saving ? 'Création…' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black/40 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 animate-scale-in my-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Modifier l’utilisateur</h2>
                <p className="text-sm text-gray-500">{editingUser.email}</p>
              </div>
              <button className="text-gray-500 hover:text-gray-700" onClick={closeEditModal} disabled={editSaving || deleteLoading}>
                ✕
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleEditSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm font-medium text-gray-700">
                  Prénom
                  <input
                    type="text"
                    name="first_name"
                    value={editForm.first_name}
                    onChange={handleEditInputChange}
                    className="input mt-1"
                    required
                  />
                </label>
                <label className="text-sm font-medium text-gray-700">
                  Nom
                  <input
                    type="text"
                    name="last_name"
                    value={editForm.last_name}
                    onChange={handleEditInputChange}
                    className="input mt-1"
                    required
                  />
                </label>
              </div>
              <label className="text-sm font-medium text-gray-700 w-full">
                Rôle
                <select
                  name="role_id"
                  value={editForm.role_id}
                  onChange={handleEditInputChange}
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

              <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  name="is_active"
                  checked={editForm.is_active}
                  onChange={handleEditInputChange}
                  className="form-checkbox h-4 w-4 text-primary-600"
                />
                Compte actif
              </label>

              <label className="text-sm font-medium text-gray-700 w-full">
                Téléphone (pour SMS)
                <input
                  type="tel"
                  name="phone"
                  value={editForm.phone}
                  onChange={handleEditInputChange}
                  className="input mt-1"
                  placeholder="+33612345678"
                />
              </label>

              <label className="text-sm font-medium text-gray-700 w-full">
                Nouveau mot de passe (optionnel, 6+ caractères)
                <input
                  type="password"
                  name="password"
                  value={editForm.password}
                  onChange={handleEditInputChange}
                  className="input mt-1"
                  minLength={6}
                />
              </label>

              {editError && (
                <div className="alert alert-error">
                  <strong>Erreur :</strong> {editError}
                </div>
              )}

              {/* Section Notifications */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold mb-3">📧 Notifications</h3>
                
                {loadingNotifPrefs ? (
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

                    {/* Numéro SMS */}
                    {notificationPrefs.sms_enabled && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Numéro SMS</label>
                        <input
                          type="tel"
                          value={notificationPrefs.phone_number || editForm.phone || ''}
                          onChange={(e) => setNotificationPrefs(prev => ({ ...prev, phone_number: e.target.value }))}
                          className="input text-sm"
                          placeholder="+33612345678"
                        />
                      </div>
                    )}

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
                <button
                  type="button"
                  className="text-red-600 hover:text-red-700 text-sm font-semibold"
                  onClick={handleDeleteUser}
                  disabled={editSaving || deleteLoading}
                >
                  {deleteLoading ? 'Suppression…' : '🗑️ Supprimer'}
                </button>
                <div className="flex items-center gap-3">
                  <button type="button" className="btn-secondary" onClick={closeEditModal} disabled={editSaving || deleteLoading}>
                    Annuler
                  </button>
                  <button type="submit" className="btn-primary" disabled={editSaving || deleteLoading}>
                    {editSaving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Détails Utilisateur */}
      {showDetailsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  👤 {selectedUser.first_name} {selectedUser.last_name}
                </h2>
                <p className="text-sm text-gray-500">{selectedUser.email}</p>
              </div>
              <button
                className="text-gray-500 hover:text-gray-900 text-2xl"
                onClick={() => {
                  setShowDetailsModal(false)
                  setSelectedUser(null)
                }}
              >
                ✖
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Informations principales */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card">
                  <p className="text-sm text-gray-500">Rôle</p>
                  <p className="font-semibold text-lg">
                    <span className={`badge ${roleColors[selectedUser.role_name] || 'bg-gray-100 text-gray-700'}`}>
                      {selectedUser.role_name}
                    </span>
                  </p>
                </div>
                <div className="card">
                  <p className="text-sm text-gray-500">Statut</p>
                  <p className="font-semibold text-lg">
                    {selectedUser.is_active ? (
                      <span className="badge badge-success">✅ Actif</span>
                    ) : (
                      <span className="badge text-gray-600 bg-gray-100">❌ Inactif</span>
                    )}
                  </p>
                </div>
                <div className="card">
                  <p className="text-sm text-gray-500">Téléphone</p>
                  <p className="font-semibold text-lg">
                    {selectedUser.phone || <span className="text-gray-400">Non renseigné</span>}
                  </p>
                </div>
                <div className="card">
                  <p className="text-sm text-gray-500">Dernière connexion</p>
                  <p className="font-semibold text-lg">
                    {selectedUser.last_login ? (
                      new Date(selectedUser.last_login).toLocaleString('fr-FR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    ) : (
                      <span className="text-gray-400">Jamais</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Date de création */}
              {selectedUser.created_at && (
                <div className="card">
                  <p className="text-sm text-gray-500">Compte créé le</p>
                  <p className="font-semibold">
                    {new Date(selectedUser.created_at).toLocaleDateString('fr-FR', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric'
                    })}
                  </p>
                </div>
              )}

              {/* Permissions */}
              {selectedUser.permissions && (
                <div className="card">
                  <h3 className="text-lg font-semibold mb-3">🔐 Permissions</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedUser.permissions.split(',').filter(p => p.trim()).map((perm, idx) => (
                      <span key={idx} className="badge badge-info">
                        {perm.trim()}
                      </span>
                    ))}
                    {(!selectedUser.permissions || selectedUser.permissions.split(',').filter(p => p.trim()).length === 0) && (
                      <span className="text-sm text-gray-400">Aucune permission spécifique</span>
                    )}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowDetailsModal(false)
                    setSelectedUser(null)
                  }}
                >
                  Fermer
                </button>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setShowDetailsModal(false)
                    openEditModal(selectedUser)
                  }}
                >
                  ✏️ Modifier
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

