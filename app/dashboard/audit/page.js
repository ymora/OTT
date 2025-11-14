'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'

export default function AuditPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    // ⚠️ MODE DÉMO - Appels API désactivés
    try {
      await new Promise(resolve => setTimeout(resolve, 300))
      setLogs([]) // Données vides
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setLoading(false)
    }
  }

  const actionColors = {
    'user.login': 'border-green-500 bg-green-50 text-green-700',
    'user.created': 'border-blue-500 bg-blue-50 text-blue-700',
    'device.config_updated': 'border-orange-500 bg-orange-50 text-orange-700',
    'firmware.uploaded': 'border-purple-500 bg-purple-50 text-purple-700',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">📜 Journal d'Audit</h1>
          <p className="text-gray-600 mt-1">Traçabilité complète des actions</p>
        </div>
        <button onClick={loadLogs} className="btn-primary">🔄 Actualiser</button>
      </div>

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
                key={log.id}
                className={`border-l-4 ${colorClass} p-4 rounded-r-lg animate-slide-up hover:shadow-md transition-all`}
                style={{animationDelay: `${i * 0.03}s`}}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold mb-1">{log.action}</p>
                    <p className="text-sm opacity-80">
                      👤 {log.email || 'Système'} • 
                      🌐 {log.ip_address} • 
                      🕒 {new Date(log.created_at).toLocaleString('fr-FR')}
                    </p>
                    {log.entity_type && (
                      <p className="text-sm mt-1">📦 {log.entity_type} #{log.entity_id}</p>
                    )}
                  </div>
                  <span className="badge bg-white">{log.action.split('.')[0]}</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

