'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

const actionColors = {
  'user.login': 'border-green-500 bg-green-50 text-green-700',
  'user.created': 'border-blue-500 bg-blue-50 text-blue-700',
  'device.config_updated': 'border-orange-500 bg-orange-50 text-orange-700',
  'firmware.uploaded': 'border-purple-500 bg-purple-50 text-purple-700',
}

export default function AuditPage() {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const [clearing, setClearing] = useState(false)

  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    '/api.php/audit?limit=200',
    { requiresAuth: true }
  )

  const logs = data?.logs || []

  const handleClearLogs = async () => {
    if (!confirm('⚠️ Êtes-vous sûr de vouloir réinitialiser le journal d\'audit ?\n\nCette action est irréversible et ne peut être effectuée que par un administrateur.')) {
      return
    }

    try {
      setClearing(true)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/audit',
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      // Recharger les logs après suppression
      await refetch()
    } catch (err) {
      console.error('Erreur réinitialisation:', err)
      // L'erreur sera gérée par ErrorMessage via le hook (refetch déclenchera une erreur si nécessaire)
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
        <button
          onClick={handleClearLogs}
          disabled={!isAdmin || clearing}
          className="btn-danger"
          title={isAdmin ? "Réinitialiser le journal d'audit" : "Réservé aux administrateurs"}
        >
          {clearing ? '⏳ Réinitialisation...' : '🗑️ RAZ Journal'}
        </button>
      </div>

      <ErrorMessage error={error} onRetry={refetch} />

      <div className="space-y-3">
        {loading ? (
          <LoadingSpinner size="lg" text="Chargement du journal d'audit..." />
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

