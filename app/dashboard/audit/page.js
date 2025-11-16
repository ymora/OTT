'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

const actionColors = {
  'user.login': 'border-green-500 bg-green-50 text-green-700',
  'user.created': 'border-blue-500 bg-blue-50 text-blue-700',
  'device.config_updated': 'border-orange-500 bg-orange-50 text-orange-700',
  'firmware.uploaded': 'border-purple-500 bg-purple-50 text-purple-700',
}

export default function AuditPage() {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [clearing, setClearing] = useState(false)

  const loadLogs = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/audit?limit=200', {}, { requiresAuth: true })
      setLogs(data.logs || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, API_URL])

  // Rafraîchir automatiquement à l'ouverture de l'onglet
  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const handleClearLogs = async () => {
    if (!confirm('⚠️ Êtes-vous sûr de vouloir réinitialiser le journal d\'audit ?\n\nCette action est irréversible et ne peut être effectuée que par un administrateur.')) {
      return
    }

    try {
      setClearing(true)
      setError(null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/audit',
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      // Recharger les logs après suppression
      await loadLogs()
    } catch (err) {
      console.error(err)
      setError(err.message || 'Erreur lors de la réinitialisation')
    } finally {
      setClearing(false)
    }
  }

  const isAdmin = user?.role_name === 'admin'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">📜 Journal d&apos;Audit</h1>
          <p className="text-gray-600 mt-1">Traçabilité complète des actions</p>
        </div>
        {isAdmin && (
          <button
            onClick={handleClearLogs}
            disabled={clearing}
            className="btn-danger"
          >
            {clearing ? '⏳ Réinitialisation...' : '🗑️ RAZ Journal'}
          </button>
        )}
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

      <div className="space-y-3">
        {loading ? (
          [1, 2, 3, 4, 5].map(i => (
            <div key={i} className="card animate-shimmer h-24"></div>
          ))
        ) : (
          logs.map((log, i) => {
            const colorClass = actionColors[log.action] || 'border-gray-300 bg-gray-50 text-gray-700'
            
            return (
              <div 
                key={log.id || i}
                className={`border-l-4 ${colorClass} p-4 rounded-r-lg animate-slide-up hover:shadow-md transition-all`}
                style={{animationDelay: `${i * 0.03}s`}}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold mb-1">{log.action}</p>
                    <p className="text-sm opacity-80">
                      👤 {log.email || 'Système'} • 🌐 {log.ip_address || 'n/a'} • 🕒 {formatDateTime(log.created_at)}
                    </p>
                    {log.entity_type && (
                      <p className="text-sm mt-1">📦 {log.entity_type} #{log.entity_id}</p>
                    )}
                  </div>
                  <span className="badge bg-white">{(log.action || '').split('.')[0]}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

