'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/Modal'
import logger from '@/lib/logger'

export default function UserModal({ 
  isOpen, 
  onClose, 
  editingItem, 
  type, 
  onSave, 
  fetchWithAuth, 
  API_URL, 
  roles, 
  currentUser 
}) {
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    role_name: 'technicien',
    is_active: true,
    password: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (editingItem) {
      setFormData({
        first_name: editingItem.first_name || '',
        last_name: editingItem.last_name || '',
        email: editingItem.email || '',
        phone: editingItem.phone || '',
        role_name: editingItem.role_name || 'technicien',
        is_active: editingItem.is_active !== false,
        password: ''
      })
    } else {
      setFormData({
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        role_name: 'technicien',
        is_active: true,
        password: ''
      })
    }
    setError('')
  }, [editingItem, isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const url = editingItem 
        ? `${API_URL}/api.php/users/${editingItem.id}`
        : `${API_URL}/api.php/users`
      
      const method = editingItem ? 'PUT' : 'POST'
      
      const payload = { ...formData }
      if (!editingItem && !payload.password) {
        payload.password = Math.random().toString(36).slice(-8)
      }
      if (editingItem && !payload.password) {
        delete payload.password
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentUser.token}`
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.message || 'Erreur lors de la sauvegarde')
      }

      await onSave()
      onClose()
    } catch (err) {
      setError(err.message || 'Erreur lors de la sauvegarde')
      logger.error('Erreur sauvegarde utilisateur:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <div className="p-6">
        <h2 className="text-xl font-bold mb-4">
          {editingItem ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Prénom</label>
              <input
                type="text"
                name="first_name"
                value={formData.first_name}
                onChange={handleChange}
                required
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Nom</label>
              <input
                type="text"
                name="last_name"
                value={formData.last_name}
                onChange={handleChange}
                required
                className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Téléphone</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Rôle</label>
            <select
              name="role_name"
              value={formData.role_name}
              onChange={handleChange}
              required
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {roles.map(role => (
                <option key={role.name} value={role.name}>
                  {role.display_name || role.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Mot de passe {editingItem && '(laisser vide pour ne pas modifier)'}
            </label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder={editingItem ? 'Laisser vide' : 'Mot de passe'}
              className="w-full p-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              name="is_active"
              id="is_active"
              checked={formData.is_active}
              onChange={handleChange}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="ml-2 text-sm">
              Utilisateur actif
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Sauvegarde...' : 'Sauvegarder'}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
