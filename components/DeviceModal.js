'use client'

import { useState, useEffect } from 'react'
import { fetchJson } from '@/lib/api'
import ErrorMessage from '@/components/ErrorMessage'
import logger from '@/lib/logger'

/**
 * Composant modal réutilisable pour créer/modifier des dispositifs
 * @param {Object} props
 * @param {boolean} props.isOpen - Si le modal est ouvert
 * @param {Function} props.onClose - Fonction pour fermer le modal
 * @param {Object|null} props.editingItem - Le dispositif en cours d'édition (null pour création)
 * @param {Function} props.onSave - Fonction appelée après sauvegarde réussie
 * @param {Object} props.fetchWithAuth - Fonction fetch avec authentification
 * @param {string} props.API_URL - URL de l'API
 * @param {Array} props.patients - Liste des patients disponibles
 * @param {Array} props.allDevices - Liste de tous les dispositifs (pour vérifier les doublons)
 */
export default function DeviceModal({
  isOpen,
  onClose,
  editingItem,
  onSave,
  fetchWithAuth,
  API_URL,
  patients = [],
  allDevices = []
}) {
  const [formData, setFormData] = useState({
    device_name: '',
    sim_iccid: '',
    device_serial: '',
    firmware_version: '',
    status: 'inactive',
    patient_id: null,
    sleep_minutes: null,
    measurement_duration_ms: null,
    send_every_n_wakeups: 1,
    calibration_coefficients: [0, 1, 0]
  })
  const [formErrors, setFormErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)

  // Initialiser le formulaire
  useEffect(() => {
    if (!isOpen) return

    if (editingItem) {
      // Mode édition - charger les données du dispositif
      setFormData({
        device_name: editingItem.device_name || '',
        sim_iccid: editingItem.sim_iccid || '',
        device_serial: editingItem.device_serial || '',
        firmware_version: editingItem.firmware_version || '',
        status: editingItem.status || 'inactive',
        patient_id: editingItem.patient_id || null,
        sleep_minutes: null,
        measurement_duration_ms: null,
        send_every_n_wakeups: 1,
        calibration_coefficients: [0, 1, 0]
      })

      // Charger la configuration si disponible
      loadDeviceConfig(editingItem.id)
    } else {
      // Mode création - réinitialiser
      setFormData({
        device_name: '',
        sim_iccid: '',
        device_serial: '',
        firmware_version: '',
        status: 'inactive',
        patient_id: null,
        sleep_minutes: null,
        measurement_duration_ms: null,
        send_every_n_wakeups: 1,
        calibration_coefficients: [0, 1, 0]
      })
    }

    setFormErrors({})
    setFormError(null)
  }, [isOpen, editingItem])

  const loadDeviceConfig = async (deviceId) => {
    if (!deviceId) return

    try {
      setLoadingConfig(true)
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${deviceId}/config`,
        {},
        { requiresAuth: true }
      )

      if (data.config) {
        setFormData(prev => ({
          ...prev,
          sleep_minutes: data.config.sleep_minutes || null,
          measurement_duration_ms: data.config.measurement_duration_ms || null,
          send_every_n_wakeups: data.config.send_every_n_wakeups || 1,
          calibration_coefficients: data.config.calibration_coefficients || [0, 1, 0]
        }))
      }
    } catch (err) {
      logger.warn('Erreur chargement configuration:', err)
      // Ne pas bloquer si la config n'existe pas encore
    } finally {
      setLoadingConfig(false)
    }
  }

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    const newFormData = {
      ...formData,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? null : parseFloat(value)) : value)
    }
    setFormData(newFormData)

    // Effacer l'erreur du champ modifié
    if (formErrors[name]) {
      setFormErrors(prev => {
        const next = { ...prev }
        delete next[name]
        return next
      })
    }
  }

  const handleCalibrationChange = (index, value) => {
    const newCoefficients = [...formData.calibration_coefficients]
    newCoefficients[index] = value === '' ? 0 : parseFloat(value)
    setFormData(prev => ({
      ...prev,
      calibration_coefficients: newCoefficients
    }))
  }

  const validateForm = () => {
    const errors = {}

    if (!formData.device_name || formData.device_name.trim().length === 0) {
      errors.device_name = 'Le nom du dispositif est requis'
    }

    if (formData.sim_iccid && formData.sim_iccid.trim().length > 0) {
      if (formData.sim_iccid.trim().length < 4 || formData.sim_iccid.trim().length > 20) {
        errors.sim_iccid = 'Le SIM ICCID doit contenir entre 4 et 20 caractères'
      } else if (!/^\d+$/.test(formData.sim_iccid.trim())) {
        errors.sim_iccid = 'Le SIM ICCID doit contenir uniquement des chiffres'
      }
    }

    if (formData.device_serial && formData.device_serial.trim().length > 0) {
      if (formData.device_serial.trim().length < 4 || formData.device_serial.trim().length > 50) {
        errors.device_serial = 'Le numéro de série doit contenir entre 4 et 50 caractères'
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      setFormError('Veuillez corriger les erreurs dans le formulaire')
      return
    }

    setSaving(true)
    setFormError(null)

    try {
      // Préparer les données du dispositif
      const devicePayload = {
        device_name: formData.device_name.trim(),
        sim_iccid: formData.sim_iccid && formData.sim_iccid.trim().length > 0 ? formData.sim_iccid.trim() : null,
        device_serial: formData.device_serial && formData.device_serial.trim().length > 0 ? formData.device_serial.trim() : null,
        firmware_version: formData.firmware_version && formData.firmware_version.trim().length > 0 ? formData.firmware_version.trim() : null,
        status: formData.status || 'inactive',
        patient_id: formData.patient_id || null
      }

      // Préparer la configuration
      const configPayload = {}
      if (formData.sleep_minutes != null) {
        configPayload.sleep_minutes = parseInt(formData.sleep_minutes)
      }
      if (formData.measurement_duration_ms != null) {
        configPayload.measurement_duration_ms = parseInt(formData.measurement_duration_ms)
      }
      if (formData.send_every_n_wakeups != null) {
        configPayload.send_every_n_wakeups = parseInt(formData.send_every_n_wakeups)
      }
      if (formData.calibration_coefficients && Array.isArray(formData.calibration_coefficients)) {
        configPayload.calibration_coefficients = formData.calibration_coefficients
      }

      if (editingItem) {
        // Modification
        const endpoint = `/api.php/devices/${editingItem.id}`

        // Mettre à jour le dispositif
        await fetchJson(
          fetchWithAuth,
          API_URL,
          endpoint,
          { method: 'PUT', body: JSON.stringify(devicePayload) },
          { requiresAuth: true }
        )

        // Mettre à jour la configuration si fournie
        if (Object.keys(configPayload).length > 0) {
          try {
            await fetchJson(
              fetchWithAuth,
              API_URL,
              `/api.php/devices/${editingItem.id}/config`,
              {
                method: 'PUT',
                body: JSON.stringify(configPayload)
              },
              { requiresAuth: true }
            )
          } catch (configErr) {
            logger.warn('⚠️ Erreur mise à jour configuration:', configErr)
            // Ne pas bloquer si la config échoue
          }
        }

        logger.log(`✅ Dispositif modifié: ${devicePayload.device_name}`)
      } else {
        // Création - vérifier d'abord si le dispositif existe déjà
        const existingDevice = allDevices.find(d =>
          (devicePayload.sim_iccid && d.sim_iccid === devicePayload.sim_iccid) ||
          (devicePayload.device_serial && d.device_serial === devicePayload.device_serial)
        )

        if (existingDevice) {
          // Le dispositif existe déjà, faire une mise à jour
          logger.log('ℹ️ Dispositif existant trouvé, mise à jour au lieu de création')
          
          await fetchJson(
            fetchWithAuth,
            API_URL,
            `/api.php/devices/${existingDevice.id}`,
            { method: 'PUT', body: JSON.stringify(devicePayload) },
            { requiresAuth: true }
          )

          // Mettre à jour la configuration
          if (Object.keys(configPayload).length > 0) {
            try {
              await fetchJson(
                fetchWithAuth,
                API_URL,
                `/api.php/devices/${existingDevice.id}/config`,
                {
                  method: 'PUT',
                  body: JSON.stringify(configPayload)
                },
                { requiresAuth: true }
              )
            } catch (configErr) {
              logger.warn('⚠️ Erreur mise à jour configuration:', configErr)
            }
          }

          logger.log(`✅ Dispositif mis à jour: ${devicePayload.device_name}`)
        } else {
          // Créer un nouveau dispositif
          const endpoint = '/api.php/devices'
          const response = await fetchWithAuth(
            `${API_URL}${endpoint}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(devicePayload)
            },
            { requiresAuth: true }
          )

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            const errorMessage = errorData.error || `Erreur HTTP ${response.status}`

            // Si l'erreur indique que le dispositif existe déjà, forcer un refetch et réessayer
            if (errorMessage.includes('déjà') || errorMessage.includes('existe') || errorMessage.includes('already') || errorMessage.includes('utilisé')) {
              logger.log('⚠️ API indique "déjà utilisé", le dispositif devrait apparaître après rafraîchissement')
              // Fermer le modal et laisser onSave gérer le refetch
              onSave()
              onClose()
              return
            }

            throw new Error(errorMessage)
          }

          const data = await response.json()
          if (!data.success) {
            throw new Error(data.error || 'Erreur API')
          }

          // Sauvegarder la configuration si fournie
          if (data.device && Object.keys(configPayload).length > 0) {
            try {
              await fetchJson(
                fetchWithAuth,
                API_URL,
                `/api.php/devices/${data.device.id}/config`,
                {
                  method: 'PUT',
                  body: JSON.stringify(configPayload)
                },
                { requiresAuth: true }
              )
            } catch (configErr) {
              logger.warn('⚠️ Erreur sauvegarde configuration:', configErr)
            }
          }

          logger.log(`✅ Dispositif créé: ${data.device?.device_name || data.device?.sim_iccid}`)
        }
      }

      // Appeler onSave pour rafraîchir les données
      onSave()
      onClose()
    } catch (err) {
      logger.error('Erreur sauvegarde dispositif:', err)
      setFormError(err.message || 'Erreur lors de la sauvegarde du dispositif')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {editingItem ? '✏️ Modifier le dispositif' : '➕ Créer un nouveau dispositif'}
          </h2>
          <button
            className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 text-2xl transition-colors"
            onClick={onClose}
          >
            ✖
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && <ErrorMessage message={formError} />}

          {/* Nom du dispositif */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Nom du dispositif <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="device_name"
              value={formData.device_name}
              onChange={handleInputChange}
              className={`input w-full ${formErrors.device_name ? 'border-red-500' : ''}`}
              placeholder="Ex: Dispositif OTT-001"
              required
            />
            {formErrors.device_name && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.device_name}</p>
            )}
          </div>

          {/* SIM ICCID */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              SIM ICCID
            </label>
            <input
              type="text"
              name="sim_iccid"
              value={formData.sim_iccid}
              onChange={handleInputChange}
              className={`input w-full ${formErrors.sim_iccid ? 'border-red-500' : ''}`}
              placeholder="Ex: 89314404000012345678"
              pattern="[0-9]{4,20}"
              title="4 à 20 chiffres"
            />
            {formErrors.sim_iccid && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.sim_iccid}</p>
            )}
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Minimum 4 caractères si renseigné</p>
          </div>

          {/* Numéro de série */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Numéro de série
            </label>
            <input
              type="text"
              name="device_serial"
              value={formData.device_serial}
              onChange={handleInputChange}
              className={`input w-full ${formErrors.device_serial ? 'border-red-500' : ''}`}
              placeholder="Ex: ESP32-001"
            />
            {formErrors.device_serial && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.device_serial}</p>
            )}
          </div>

          {/* Version du firmware */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Version du firmware
            </label>
            <input
              type="text"
              name="firmware_version"
              value={formData.firmware_version}
              onChange={handleInputChange}
              className="input w-full"
              placeholder="Ex: 3.8-unified"
            />
          </div>

          {/* Statut */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Statut
            </label>
            <select
              name="status"
              value={formData.status}
              onChange={handleInputChange}
              className="input w-full"
            >
              <option value="inactive">Inactif</option>
              <option value="active">Actif</option>
              <option value="usb_connected">Connecté USB</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          {/* Patient */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Patient
            </label>
            <select
              name="patient_id"
              value={formData.patient_id || ''}
              onChange={handleInputChange}
              className="input w-full"
            >
              <option value="">— Aucun patient —</option>
              {patients.map(patient => (
                <option key={patient.id} value={patient.id}>
                  {patient.first_name} {patient.last_name} {patient.email ? `(${patient.email})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Configuration */}
          <div className="border-t border-gray-200 dark:border-slate-700 pt-4 mt-4">
            <h3 className="text-sm font-semibold mb-4 text-gray-700 dark:text-gray-300">Configuration</h3>

            {/* Intervalle de veille */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                ⏰ Intervalle de veille (minutes)
              </label>
              <input
                type="number"
                name="sleep_minutes"
                value={formData.sleep_minutes || ''}
                onChange={handleInputChange}
                className="input w-full"
                placeholder="Ex: 5"
                min="1"
              />
            </div>

            {/* Durée de mesure */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                ⏱️ Durée de mesure (ms)
              </label>
              <input
                type="number"
                name="measurement_duration_ms"
                value={formData.measurement_duration_ms || ''}
                onChange={handleInputChange}
                className="input w-full"
                placeholder="Ex: 5000"
                min="1"
              />
            </div>

            {/* Envoyer toutes les N réveils */}
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                📤 Envoyer toutes les N réveils
              </label>
              <input
                type="number"
                name="send_every_n_wakeups"
                value={formData.send_every_n_wakeups || 1}
                onChange={handleInputChange}
                className="input w-full"
                min="1"
              />
            </div>

            {/* Calibration */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                📐 Calibration (a0, a1, a2)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map(index => (
                  <input
                    key={index}
                    type="number"
                    step="any"
                    value={formData.calibration_coefficients[index] || 0}
                    onChange={(e) => handleCalibrationChange(index, e.target.value)}
                    className="input w-full"
                    placeholder={`a${index}`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Boutons */}
          <div className="flex gap-2 justify-end pt-4 border-t border-gray-200 dark:border-slate-700">
            <button
              type="button"
              className="btn-secondary"
              onClick={onClose}
              disabled={saving}
            >
              Annuler
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || loadingConfig}
            >
              {saving ? '⏳ Enregistrement...' : (editingItem ? '💾 Enregistrer les modifications' : '✅ Créer le dispositif')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

