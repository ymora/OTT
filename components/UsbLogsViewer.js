'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'
import LoadingSpinner from './LoadingSpinner'
import ErrorMessage from './ErrorMessage'

/**
 * Composant pour visualiser les logs USB à distance
 * Accessible uniquement aux administrateurs
 */
export default function UsbLogsViewer({ deviceIdentifier = null }) {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [filter, setFilter] = useState({
    device: deviceIdentifier || '',
    source: 'all', // 'all', 'device', 'dashboard'
    limit: 100
  })
  const [devices, setDevices] = useState([])
  const logsEndRef = useRef(null)
  const autoScrollEnabled = useRef(true)

  // Vérifier que l'utilisateur est admin
  const isAdmin = user?.role_name === 'admin'

  // Charger la liste des dispositifs pour le filtre
  useEffect(() => {
    if (!isAdmin) return

    const loadDevices = async () => {
      try {
        const response = await fetchJson(fetchWithAuth, API_URL, '/api.php/devices', {}, { requiresAuth: true })
        if (response.success && response.devices) {
          setDevices(response.devices.devices || [])
        }
      } catch (err) {
        logger.error('Erreur chargement dispositifs:', err)
      }
    }

    loadDevices()
  }, [isAdmin, fetchWithAuth, API_URL])

  // Fonction pour charger les logs
  const loadLogs = async () => {
    if (!isAdmin) {
      setError('Accès refusé. Seuls les administrateurs peuvent consulter les logs.')
      setLoading(false)
      return
    }

    try {
      setError(null)
      
      const params = new URLSearchParams()
      if (filter.device) {
        params.append('device', filter.device)
      }
      if (filter.source && filter.source !== 'all') {
        params.append('source', filter.source)
      }
      params.append('limit', filter.limit)
      
      const url = `/api.php/usb-logs${filter.device ? '/' + filter.device : ''}?${params.toString()}`
      
      const response = await fetchJson(fetchWithAuth, API_URL, url, {}, { requiresAuth: true })
      
      if (response.success) {
        setLogs(response.logs || [])
        
        // Auto-scroll vers le bas si activé
        if (autoScrollEnabled.current && logsEndRef.current) {
          setTimeout(() => {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
          }, 100)
        }
      } else {
        setError(response.error || 'Erreur lors du chargement des logs')
      }
    } catch (err) {
      logger.error('Erreur chargement logs USB:', err)
      setError('Erreur lors du chargement des logs')
    } finally {
      setLoading(false)
    }
  }

  // Charger les logs au montage et quand les filtres changent
  useEffect(() => {
    loadLogs()
  }, [filter.device, filter.source, filter.limit])

  // Auto-refresh toutes les 5 secondes si activé
  useEffect(() => {
    if (!autoRefresh || !isAdmin) return

    const interval = setInterval(() => {
      loadLogs()
    }, 5000)

    return () => clearInterval(interval)
  }, [autoRefresh, isAdmin, filter])

  // Fonction pour nettoyer les vieux logs (admin seulement)
  const cleanupOldLogs = async () => {
    if (!isAdmin) return

    try {
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/usb-logs/cleanup',
        { method: 'DELETE' },
        { requiresAuth: true }
      )

      if (response.success) {
        alert(`${response.deleted_count} logs supprimés avec succès`)
        loadLogs() // Recharger
      } else {
        alert('Erreur lors du nettoyage: ' + (response.error || 'Erreur inconnue'))
      }
    } catch (err) {
      logger.error('Erreur nettoyage logs:', err)
      alert('Erreur lors du nettoyage des logs')
    }
  }

  // Fonction pour formater la date
  const formatDate = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleString('fr-FR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  if (!isAdmin) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-700 dark:text-red-400">
          ⛔ Accès refusé. Seuls les administrateurs peuvent consulter les logs USB.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* En-tête avec titre et contrôles */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
          📡 Logs USB - Monitoring à Distance
        </h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded"
            />
            Auto-refresh (5s)
          </label>
          <button
            onClick={loadLogs}
            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition"
            disabled={loading}
          >
            🔄 Actualiser
          </button>
          <button
            onClick={cleanupOldLogs}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition"
            title="Supprimer les logs de plus de 7 jours"
          >
            🗑️ Nettoyer
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-4 p-4 bg-gray-50 dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Dispositif
          </label>
          <select
            value={filter.device}
            onChange={(e) => setFilter(prev => ({ ...prev, device: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            <option value="">Tous les dispositifs</option>
            {devices.map(device => (
              <option key={device.id} value={device.sim_iccid || device.device_serial || device.device_name}>
                {device.device_name} ({device.sim_iccid || device.device_serial})
              </option>
            ))}
          </select>
        </div>

        <div className="w-40">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Source
          </label>
          <select
            value={filter.source}
            onChange={(e) => setFilter(prev => ({ ...prev, source: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            <option value="all">Tous</option>
            <option value="device">Firmware</option>
            <option value="dashboard">Dashboard</option>
          </select>
        </div>

        <div className="w-32">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Limite
          </label>
          <select
            value={filter.limit}
            onChange={(e) => setFilter(prev => ({ ...prev, limit: parseInt(e.target.value) }))}
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100"
          >
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="200">200</option>
            <option value="500">500</option>
            <option value="1000">1000</option>
          </select>
        </div>
      </div>

      {/* Affichage des erreurs */}
      {error && <ErrorMessage message={error} />}

      {/* Affichage des logs */}
      {loading && logs.length === 0 ? (
        <div className="flex justify-center p-8">
          <LoadingSpinner />
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-900 p-4 shadow-inner overflow-y-auto" style={{ minHeight: '400px', maxHeight: '600px' }}>
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
              <span className="text-4xl">📭</span>
              <p className="font-medium">Aucun log USB disponible</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Les logs apparaîtront ici lorsqu'un dispositif USB sera connecté
              </p>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-sm tracking-tight">
              {logs.map((log) => {
                const isDashboard = log.log_source === 'dashboard'
                return (
                  <div key={log.id} className="whitespace-pre-wrap">
                    <span className="text-gray-500 pr-3">
                      {formatDate(log.timestamp_ms || log.created_at)}
                    </span>
                    <span className={isDashboard ? 'text-blue-400' : 'text-green-400'}>
                      [{log.log_source}]
                    </span>
                    {' '}
                    <span className="text-gray-400">
                      [{log.device_name || log.device_identifier}]
                    </span>
                    {' '}
                    <span className="text-gray-200">
                      {log.log_line}
                    </span>
                  </div>
                )
              })}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Statistiques */}
      {logs.length > 0 && (
        <div className="text-sm text-gray-600 dark:text-gray-400 text-center">
          {logs.length} log{logs.length > 1 ? 's' : ''} affiché{logs.length > 1 ? 's' : ''}
          {filter.device && ` pour ${devices.find(d => (d.sim_iccid || d.device_serial || d.device_name) === filter.device)?.device_name || filter.device}`}
        </div>
      )}
    </div>
  )
}

