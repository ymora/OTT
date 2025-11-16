'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import AlertCard from '@/components/AlertCard'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

export default function AlertsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [severityFilter, setSeverityFilter] = useState('ALL')
  const [deviceFilter, setDeviceFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const loadAlerts = useCallback(async () => {
    try {
      setError(null)
      const [alertsData, devicesData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, '/api.php/alerts'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/devices')
      ])
      setAlerts(alertsData.alerts || [])
      setDevices(devicesData.devices || [])
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
      // Ne garder que les alertes actives (non résolues)
      if (a.status === 'resolved') return false
      
      // Filtre par sévérité
      if (severityFilter !== 'ALL' && a.severity !== severityFilter) return false
      
      // Filtre par dispositif
      if (deviceFilter !== 'ALL' && String(a.device_id) !== deviceFilter) return false
      
      // Filtre de recherche
      if (searchTerm) {
        const needle = searchTerm.toLowerCase()
        const haystack = `${a.device_name || ''} ${a.sim_iccid || ''} ${a.first_name || ''} ${a.last_name || ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [alerts, severityFilter, deviceFilter, searchTerm])

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">🔔 Alertes</h1>

      {/* Filtres - Présentés comme dans Logs */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Filtres par sévérité */}
        <div className="flex gap-2">
          {['ALL', 'critical', 'high', 'medium', 'low'].map(severity => (
            <button
              key={severity}
              onClick={() => setSeverityFilter(severity)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                severityFilter === severity
                  ? 'bg-primary-500 text-white shadow-lg scale-105'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
            >
              {severity === 'ALL' ? 'Toutes' : severity.charAt(0).toUpperCase() + severity.slice(1)}
            </button>
          ))}
        </div>

        {/* Filtres dispositif et recherche */}
        <div className="flex gap-3 md:ml-auto">
          <select
            value={deviceFilter}
            onChange={e => setDeviceFilter(e.target.value)}
            className="input"
          >
            <option value="ALL">Tous les dispositifs</option>
            {devices.map(device => (
              <option key={device.id} value={device.id}>{device.device_name || device.sim_iccid}</option>
            ))}
          </select>
          <input
            type="text"
            className="input"
            placeholder="Rechercher dans les alertes..."
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

