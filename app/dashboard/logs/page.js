'use client'

import { useMemo, useState } from 'react'
import { demoLogs, demoDevices } from '@/lib/demoData'
import { formatDateTime } from '@/lib/utils'

const typeStyles = {
  INFO: 'bg-blue-50 text-blue-700 border-blue-200',
  WARN: 'bg-orange-50 text-orange-700 border-orange-200',
  ERROR: 'bg-red-50 text-red-700 border-red-200'
}

export default function LogsPage() {
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [deviceFilter, setDeviceFilter] = useState('ALL')
  const [searchTerm, setSearchTerm] = useState('')

  const filteredLogs = useMemo(() => {
    return demoLogs.filter(log => {
      if (typeFilter !== 'ALL' && log.type !== typeFilter) return false
      if (deviceFilter !== 'ALL' && log.device_name !== deviceFilter) return false
      if (searchTerm && !log.message.toLowerCase().includes(searchTerm.toLowerCase())) return false
      return true
    })
  }, [typeFilter, deviceFilter, searchTerm])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">📝 Journal Système</h1>
          <p className="text-gray-600 mt-1">Suivi des transmissions, warnings et erreurs des dispositifs OTT.</p>
        </div>
        <div className="space-x-2">
          {['ALL', 'INFO', 'WARN', 'ERROR'].map(type => (
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
              <option value="ALL">Tous les dispositifs</option>
              {demoDevices.map(device => (
                <option key={device.id} value={device.device_name}>{device.device_name}</option>
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

        <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
          {filteredLogs.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              Aucun log ne correspond aux filtres appliqués.
            </div>
          )}

          {filteredLogs.map(log => (
            <div
              key={log.id}
              className={`border rounded-xl p-4 flex items-start gap-4 animate-slide-up ${typeStyles[log.type]}`}
            >
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-lg font-bold">
                {log.device_name.split('-').pop()}
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <p className="font-semibold text-gray-900">{log.device_name}</p>
                  <span className="text-xs px-2 py-1 bg-white rounded-full font-semibold">{log.type}</span>
                  <span className="text-sm text-gray-500">{formatDateTime(log.created_at)}</span>
                </div>
                <p className="text-gray-800">{log.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
