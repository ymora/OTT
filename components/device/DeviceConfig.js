'use client'

import { useState, useCallback } from 'react'
import { DEVICE_DEFAULTS } from '@/lib/deviceDefaults'

/**
 * Composant pour la configuration du dispositif
 */
export default function DeviceConfig({ device, setDevice }) {
  const [errors, setErrors] = useState({})

  const handleChange = useCallback((field, value) => {
    setDevice(prev => ({ ...prev, [field]: value }))
    
    // Validation simple
    const newErrors = { ...errors }
    
    if (field === 'measurement_interval' && (value < 1 || value > 1440)) {
      newErrors[field] = 'Intervalle doit être entre 1 et 1440 minutes'
    } else if (field === 'battery_threshold' && (value < 1 || value > 100)) {
      newErrors[field] = 'Seuil doit être entre 1 et 100%'
    } else {
      delete newErrors[field]
    }
    
    setErrors(newErrors)
  }, [setDevice, errors])

  const resetToDefaults = useCallback(() => {
    setDevice(prev => ({
      ...prev,
      ...DEVICE_DEFAULTS
    }))
    setErrors({})
  }, [setDevice])

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Configuration du dispositif
        </h3>
        <button
          type="button"
          onClick={resetToDefaults}
          className="text-sm px-3 py-1 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition-colors"
        >
          Réinitialiser par défaut
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Intervalle de mesure (minutes)
          </label>
          <input
            type="number"
            min="1"
            max="1440"
            value={device.measurement_interval || DEVICE_DEFAULTS.measurement_interval}
            onChange={(e) => handleChange('measurement_interval', parseInt(e.target.value))}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.measurement_interval ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.measurement_interval && (
            <p className="text-red-500 text-xs mt-1">{errors.measurement_interval}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Seuil batterie faible (%)
          </label>
          <input
            type="number"
            min="1"
            max="100"
            value={device.battery_threshold || DEVICE_DEFAULTS.battery_threshold}
            onChange={(e) => handleChange('battery_threshold', parseInt(e.target.value))}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.battery_threshold ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.battery_threshold && (
            <p className="text-red-500 text-xs mt-1">{errors.battery_threshold}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Mode de transmission
          </label>
          <select
            value={device.transmission_mode || DEVICE_DEFAULTS.transmission_mode}
            onChange={(e) => handleChange('transmission_mode', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="realtime">Temps réel</option>
            <option value="batch">Par lot</option>
            <option value="on_demand">Sur demande</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Niveau de log
          </label>
          <select
            value={device.log_level || DEVICE_DEFAULTS.log_level}
            onChange={(e) => handleChange('log_level', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="error">Erreur uniquement</option>
            <option value="warning">Erreur + Avertissement</option>
            <option value="info">Complet</option>
          </select>
        </div>
      </div>

      <div className="space-y-3">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={device.enable_gps || DEVICE_DEFAULTS.enable_gps}
            onChange={(e) => handleChange('enable_gps', e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Activer le GPS
          </span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={device.enable_alerts || DEVICE_DEFAULTS.enable_alerts}
            onChange={(e) => handleChange('enable_alerts', e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Activer les alertes
          </span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={device.enable_auto_update || DEVICE_DEFAULTS.enable_auto_update}
            onChange={(e) => handleChange('enable_auto_update', e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            Mises à jour automatiques
          </span>
        </label>
      </div>
    </div>
  )
}
