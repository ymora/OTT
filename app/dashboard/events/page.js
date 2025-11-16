'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'
import AlertCard from '@/components/AlertCard'

const logTypeStyles = {
  INFO: 'bg-blue-50 text-blue-700 border-blue-200',
  WARN: 'bg-orange-50 text-orange-700 border-orange-200',
  ERROR: 'bg-red-50 text-red-700 border-red-200'
}

export default function EventsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [activeView, setActiveView] = useState('alerts') // 'alerts' ou 'logs'
  
  // États pour les alertes
  const [alerts, setAlerts] = useState([])
  const [severityFilter, setSeverityFilter] = useState('ALL')
  
  // États pour les logs
  const [logs, setLogs] = useState([])
  const [typeFilter, setTypeFilter] = useState('ALL')
  
  // États communs
  const [devices, setDevices] = useState([])
  const [deviceFilter, setDeviceFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)
      const [alertsData, logsData, devicesData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, '/api.php/alerts').catch(() => ({ alerts: [] })),
        fetchJson(fetchWithAuth, API_URL, '/api.php/logs?limit=200').catch(() => ({ logs: [] })),
        fetchJson(fetchWithAuth, API_URL, '/api.php/devices').catch(() => ({ devices: [] }))
      ])
      setAlerts(alertsData.alerts || [])
      setLogs(logsData.logs || [])
      setDevices(devicesData.devices || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, API_URL])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtrage des alertes
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
        const haystack = `${a.device_name || ''} ${a.sim_iccid || ''} ${a.first_name || ''} ${a.last_name || ''} ${a.message || ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [alerts, severityFilter, deviceFilter, searchTerm])

  // Filtrage des logs
  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const level = (log.level || 'INFO').toUpperCase()
      if (typeFilter !== 'ALL' && level !== typeFilter) return false
      if (deviceFilter !== 'ALL' && String(log.device_id) !== deviceFilter) return false
      if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })
  }, [logs, typeFilter, deviceFilter, searchTerm])

  // Statistiques
  const stats = useMemo(() => {
    const activeAlerts = alerts.filter(a => a.status !== 'resolved')
    return {
      alerts: {
        total: activeAlerts.length,
        critical: activeAlerts.filter(a => a.severity === 'critical').length,
        high: activeAlerts.filter(a => a.severity === 'high').length,
        medium: activeAlerts.filter(a => a.severity === 'medium').length,
        low: activeAlerts.filter(a => a.severity === 'low').length,
      },
      logs: {
        total: logs.length,
        error: logs.filter(l => (l.level || 'INFO').toUpperCase() === 'ERROR').length,
        warn: logs.filter(l => (l.level || 'INFO').toUpperCase() === 'WARN').length,
        info: logs.filter(l => (l.level || 'INFO').toUpperCase() === 'INFO').length,
      }
    }
  }, [alerts, logs])

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">📊 Événements Système</h1>
        <p className="text-gray-600 mt-1">Alertes et logs des dispositifs en temps réel</p>
      </div>

      {/* Statistiques rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <p className="text-sm text-gray-500">Alertes actives</p>
          <p className="text-2xl font-semibold text-red-500">{stats.alerts.total}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Erreurs récentes</p>
          <p className="text-2xl font-semibold text-orange-500">{stats.logs.error}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Avertissements</p>
          <p className="text-2xl font-semibold text-yellow-500">{stats.logs.warn}</p>
        </div>
        <div className="card">
          <p className="text-sm text-gray-500">Total logs</p>
          <p className="text-2xl font-semibold text-gray-700">{stats.logs.total}</p>
        </div>
      </div>

      {/* Sélection de la vue (Alertes / Logs) */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveView('alerts')}
          className={`px-6 py-3 font-medium transition-all border-b-2 ${
            activeView === 'alerts'
              ? 'border-red-500 text-red-600 bg-red-50'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          🔔 Alertes ({stats.alerts.total})
        </button>
        <button
          onClick={() => setActiveView('logs')}
          className={`px-6 py-3 font-medium transition-all border-b-2 ${
            activeView === 'logs'
              ? 'border-blue-500 text-blue-600 bg-blue-50'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          📝 Logs ({stats.logs.total})
        </button>
      </div>

      {/* Filtres communs */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Filtres spécifiques selon la vue */}
        {activeView === 'alerts' ? (
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
        ) : (
          <div className="flex gap-2">
            {['ALL', 'INFO', 'WARN', 'ERROR'].map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === type
                    ? 'bg-primary-500 text-white shadow-lg scale-105'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {type === 'ALL' ? 'Tous' : type}
              </button>
            ))}
          </div>
        )}

        {/* Filtres communs (dispositif et recherche) */}
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
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input"
            placeholder={activeView === 'alerts' ? 'Rechercher dans les alertes...' : 'Rechercher dans les logs...'}
          />
          <button
            className="btn-secondary"
            onClick={loadData}
            disabled={loading}
            title="Actualiser"
          >
            🔄
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

      {/* Contenu selon la vue active */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="card animate-shimmer h-24"></div>
          ))}
        </div>
      ) : activeView === 'alerts' ? (
        <div className="space-y-3">
          {filteredAlerts.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <p className="text-lg mb-2">Aucune alerte active</p>
              <p className="text-sm">Les alertes résolues ne sont pas affichées ici</p>
            </div>
          ) : (
            filteredAlerts.map((alert, i) => (
              <AlertCard key={alert.id} alert={alert} delay={i * 0.03} />
            ))
          )}
        </div>
      ) : (
        <div className="card space-y-3 max-h-[600px] overflow-y-auto pr-2">
          {filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-gray-500">Aucun log ne correspond aux filtres.</div>
          ) : (
            filteredLogs.map((log, i) => {
              const level = (log.level || 'INFO').toUpperCase()
              return (
                <div
                  key={log.id || i}
                  className={`border rounded-xl p-4 flex items-start gap-4 animate-slide-up ${logTypeStyles[level] || logTypeStyles.INFO}`}
                >
                  <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-lg font-bold">
                    {log.device_name ? log.device_name.split('-').pop() : 'OTT'}
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      <p className="font-semibold text-gray-900">{log.device_name || 'Dispositif inconnu'}</p>
                      <span className="text-xs px-2 py-1 bg-white rounded-full font-semibold">{level}</span>
                      <span className="text-sm text-gray-500">{formatDateTime(log.timestamp || log.created_at)}</span>
                    </div>
                    <p className="text-gray-800">{log.message}</p>
                    <p className="text-xs text-gray-600 mt-1">
                      {log.first_name || log.last_name
                        ? `Patient : ${log.first_name || ''} ${log.last_name || ''}`
                        : 'Patient non assigné'}
                    </p>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

