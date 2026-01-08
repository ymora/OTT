'use client'

import { useState, useCallback } from 'react'

/**
 * Composant pour les informations de firmware du dispositif
 */
export default function DeviceFirmware({ device, setDevice, firmwares }) {
  const [errors, setErrors] = useState({})

  const handleChange = useCallback((field, value) => {
    setDevice(prev => ({ ...prev, [field]: value }))
  }, [setDevice])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Firmware actuel
          </label>
          <select
            value={device.current_firmware_id || ''}
            onChange={(e) => handleChange('current_firmware_id', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Aucun</option>
            {firmwares.map(firmware => (
              <option key={firmware.id} value={firmware.id}>
                {firmware.version} - {firmware.status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Firmware cible
          </label>
          <select
            value={device.target_firmware_id || ''}
            onChange={(e) => handleChange('target_firmware_id', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="">Aucun</option>
            {firmwares.map(firmware => (
              <option key={firmware.id} value={firmware.id}>
                {firmware.version} - {firmware.status}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Version du bootloader
          </label>
          <input
            type="text"
            value={device.bootloader_version || ''}
            onChange={(e) => handleChange('bootloader_version', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            placeholder="v1.0.0"
            readOnly
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date dernière mise à jour
          </label>
          <input
            type="text"
            value={device.firmware_updated_at ? new Date(device.firmware_updated_at).toLocaleDateString() : ''}
            onChange={(e) => handleChange('firmware_updated_at', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 dark:bg-gray-600 dark:text-gray-300"
            readOnly
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes de firmware
        </label>
        <textarea
          value={device.firmware_notes || ''}
          onChange={(e) => handleChange('firmware_notes', e.target.value)}
          rows={2}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          placeholder="Notes sur la version du firmware..."
        />
      </div>

      {/* Statut de mise à jour */}
      {device.target_firmware_id && device.target_firmware_id !== device.current_firmware_id && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
            <span className="text-sm text-blue-700 dark:text-blue-300">
              Mise à jour firmware en attente
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
