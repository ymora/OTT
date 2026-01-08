'use client'

import { useState, useCallback } from 'react'

/**
 * Composant pour les informations générales du dispositif
 */
export default function DeviceGeneralInfo({ device, setDevice, patients, allDevices }) {
  const [errors, setErrors] = useState({})

  const validateField = useCallback((field, value) => {
    const newErrors = { ...errors }
    
    switch (field) {
      case 'serial_number':
        if (!value) {
          newErrors[field] = 'Numéro de série requis'
        } else if (allDevices.some(d => d.serial_number === value && d.id !== device.id)) {
          newErrors[field] = 'Ce numéro de série existe déjà'
        } else {
          delete newErrors[field]
        }
        break
        
      case 'sim_iccid':
        if (value && allDevices.some(d => d.sim_iccid === value && d.id !== device.id)) {
          newErrors[field] = 'Ce SIM ICCID existe déjà'
        } else {
          delete newErrors[field]
        }
        break
        
      case 'patient_id':
        if (!value) {
          newErrors[field] = 'Patient requis'
        } else {
          delete newErrors[field]
        }
        break
        
      default:
        delete newErrors[field]
    }
    
    setErrors(newErrors)
  }, [errors, device.id, allDevices])

  const handleChange = useCallback((field, value) => {
    setDevice(prev => ({ ...prev, [field]: value }))
    validateField(field, value)
  }, [setDevice, validateField])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Numéro de série *
          </label>
          <input
            type="text"
            value={device.serial_number || ''}
            onChange={(e) => handleChange('serial_number', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.serial_number ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="SN-XXXXXX"
          />
          {errors.serial_number && (
            <p className="text-red-500 text-xs mt-1">{errors.serial_number}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            SIM ICCID
          </label>
          <input
            type="text"
            value={device.sim_iccid || ''}
            onChange={(e) => handleChange('sim_iccid', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.sim_iccid ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="89XXXXXXXXXXXXXXX"
          />
          {errors.sim_iccid && (
            <p className="text-red-500 text-xs mt-1">{errors.sim_iccid}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Patient *
          </label>
          <select
            value={device.patient_id || ''}
            onChange={(e) => handleChange('patient_id', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
              errors.patient_id ? 'border-red-500' : 'border-gray-300'
            }`}
          >
            <option value="">Sélectionner un patient</option>
            {patients.map(patient => (
              <option key={patient.id} value={patient.id}>
                {patient.first_name} {patient.last_name}
              </option>
            ))}
          </select>
          {errors.patient_id && (
            <p className="text-red-500 text-xs mt-1">{errors.patient_id}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Statut
          </label>
          <select
            value={device.status || 'active'}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
            <option value="maintenance">Maintenance</option>
            <option value="lost">Perdu</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Notes
        </label>
        <textarea
          value={device.notes || ''}
          onChange={(e) => handleChange('notes', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          placeholder="Notes sur le dispositif..."
        />
      </div>
    </div>
  )
}
