'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AlertCard from '@/components/AlertCard'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

export default function AlertsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const loadAlerts = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/alerts')
      setAlerts(data.alerts || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, API_URL])

  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  const filteredAlerts = useMemo(() => {
    return alerts.filter(a => {
      if (filter !== 'all' && a.status !== filter) return false
      if (searchTerm) {
        const needle = searchTerm.toLowerCase()
        const haystack = `${a.device_name || ''} ${a.sim_iccid || ''} ${a.first_name || ''} ${a.last_name || ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [alerts, filter, searchTerm])

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">🔔 Alertes</h1>

      {/* Filtres */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex gap-3">
          {['all', 'unresolved', 'resolved'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === f ? 'bg-primary-500 text-white shadow-lg scale-105' : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {f === 'all' ? 'Toutes' : f === 'unresolved' ? 'Non résolues' : 'Résolues'}
            </button>
          ))}
        </div>
        <div className="md:ml-auto">
          <input
            type="text"
            className="input"
            placeholder="Rechercher patient ou dispositif..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="card animate-shimmer h-24"></div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert, i) => (
            <AlertCard key={alert.id} alert={alert} delay={i * 0.03} />
          ))}
        </div>
      )}
    </div>
  )
}

