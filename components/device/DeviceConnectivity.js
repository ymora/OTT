'use client'

import { useState, useCallback } from 'react'

/**
 * Composant pour les informations de connectivité du dispositif
 */
export default function DeviceConnectivity({ device, setDevice }) {
  const [errors, setErrors] = useState({})

  const handleChange = useCallback((field, value) => {
    setDevice(prev => ({ ...prev, [field]: value }))
  }, [setDevice])

  const testConnection = useCallback(async () => {
    // Simuler un test de connexion
    setDevice(prev => ({ 
      ...prev, 
      last_seen: new Date().toISOString(),
      connection_status: 'online'
    }))
  }, [setDevice])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Opérateur réseau
          </label>
          <select
            value={device.network_operator || ''}
            onChange={(e) => handleChange('network_operator', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Sélectionner</option>
            <option value="orange">Orange</option>
            <option value="sfr">SFR</option>
            <option value="bouygues">Bouygues</option>
            <option value="free">Free</option>
            <option value="other">Autre</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Force signal (dBm)
          </label>
          <input
            type="number"
            min="-120"
            max="0"
            value={device.signal_strength || ''}
            onChange={(e) => handleChange('signal_strength', parseInt(e.target.value))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="-70"
            readOnly
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            APN
          </label>
          <input
            type="text"
            value={device.apn || ''}
            onChange={(e) => handleChange('apn', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="iot.Orange.fr"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Statut connexion
          </label>
          <div className="flex items-center space-x-2">
            <div className={`w-3 h-3 rounded-full ${
              device.connection_status === 'online' ? 'bg-green-500' : 
              device.connection_status === 'offline' ? 'bg-red-500' : 'bg-yellow-500'
            }`}></div>
            <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
              {device.connection_status || 'unknown'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Adresse IP
          </label>
          <input
            type="text"
            value={device.ip_address || ''}
            onChange={(e) => handleChange('ip_address', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 dark:bg-gray-600 dark:text-gray-300"
            placeholder="192.168.1.100"
            readOnly
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Dernière connexion
          </label>
          <input
            type="text"
            value={device.last_seen ? new Date(device.last_seen).toLocaleString() : ''}
            onChange={(e) => handleChange('last_seen', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 dark:bg-gray-600 dark:text-gray-300"
            readOnly
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={testConnection}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          Tester connexion
        </button>
      </div>
    </div>
  )
}
