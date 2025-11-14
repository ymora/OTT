'use client'

import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { formatDateTime } from '@/lib/utils'

const typeStyles = {
  SUCCESS: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  INFO: 'bg-blue-50 text-blue-700 border-blue-200',
  WARN: 'bg-orange-50 text-orange-700 border-orange-200',
  ERROR: 'bg-red-50 text-red-700 border-red-200'
}

export default function LogsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [logs, setLogs] = useState([])
  const [devices, setDevices] = useState([])
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [deviceFilter, setDeviceFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadData = async () => {
      try {
        setError(null)
        const [logsData, devicesData] = await Promise.all([
          fetchJson(fetchWithAuth, API_URL, '/api.php/logs?limit=200'),
          fetchJson(fetchWithAuth, API_URL, '/api.php/devices')
        ])
        setLogs(logsData.logs || [])
        setDevices(devicesData.devices || [])
      } catch (err) {
        console.error(err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [fetchWithAuth, API_URL])

  const filteredLogs = useMemo(() => {
  return logs.filter(log => {
    const level = (log.level || 'INFO').toUpperCase()
    if (typeFilter !== 'ALL' && level !== typeFilter) return false
    if (deviceFilter !== 'ALL' && String(log.device_id) !== deviceFilter) return false
    if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false
    return true
  })
  }, [logs, typeFilter, deviceFilter, searchTerm])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">📝 Journal Système</h1>
          <p className="text-gray-600 mt-1">Suivi temps réel des événements terrain.</p>
        </div>
        <div className="space-x-2">
          {['ALL', 'INFO', 'WARN', 'ERROR', 'SUCCESS'].map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                typeFilter === type
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {type === 'ALL' ? 'Tous' : type}
            </button>
          ))}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Dispositif</label>
            <select
              value={deviceFilter}
              onChange={e => setDeviceFilter(e.target.value)}
              className="input"
            >
              <option value="ALL">Tous</option>
              {devices.map(device => (
                <option key={device.id} value={device.id}>{device.device_name || device.sim_iccid}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">Rechercher</label>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="input"
              placeholder="Ex: batterie, transmission, OTA..."
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
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="card animate-shimmer h-24"></div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Aucun log ne correspond aux filtres.</div>
            ) : (
              filteredLogs.map((log, i) => {
                const level = (log.level || 'INFO').toUpperCase()
                return (
                  <div
                    key={log.id || i}
                    className={`border rounded-xl p-4 flex items-start gap-4 animate-slide-up ${typeStyles[level] || typeStyles.INFO}`}
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
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
