'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

export default function UsersPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setError(null)
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/users')
      setUsers(data.users || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const roleColors = {
    admin: 'bg-purple-100 text-purple-700',
    medecin: 'bg-green-100 text-green-700',
    technicien: 'bg-blue-100 text-blue-700',
    viewer: 'bg-gray-100 text-gray-700',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">👥 Utilisateurs</h1>
          <p className="text-gray-600 mt-1">Gestion des accès et permissions</p>
        </div>
        <button className="btn-primary">
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
                  <th className="text-left py-3 px-4">Statut</th>
                  <th className="text-left py-3 px-4">Dernière connexion</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user, i) => (
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
                    <td className="py-3 px-4">
                      {user.is_active ? (
                        <span className="badge badge-success">✅ Actif</span>
                      ) : (
                        <span className="badge text-gray-600 bg-gray-100">❌ Inactif</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {user.last_login ? new Date(user.last_login).toLocaleString('fr-FR') : 'Jamais'}
                    </td>
                    <td className="py-3 px-4">
                      <button className="btn-secondary text-sm">✏️ Modifier</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

