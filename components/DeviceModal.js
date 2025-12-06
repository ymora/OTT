'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { fetchJson } from '@/lib/api'
import ErrorMessage from '@/components/ErrorMessage'
import logger from '@/lib/logger'

// Composant Accordéon simple
function Accordion({ title, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen)
  
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{title}</span>
        <span className="text-gray-500 dark:text-gray-400">{isOpen ? '▼' : '▶'}</span>
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-2">
          {children}
        </div>
      )}
    </div>
  )
}

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
 * @param {Function} props.appendLog - Fonction pour ajouter un log au terminal USB (optionnel)
 */
export default function DeviceModal({
  isOpen,
  onClose,
  editingItem,
  onSave,
  fetchWithAuth,
  API_URL,
  patients = [],
  allDevices = [],
  appendLog = null
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
    calibration_coefficients: [0, 1, 0],
    gps_enabled: false
  })
  const [formErrors, setFormErrors] = useState({})
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loadingConfig, setLoadingConfig] = useState(false)

  // Initialiser le formulaire UNIQUEMENT lors de l'ouverture du modal
  // Utiliser un ref pour éviter les réinitialisations lors de changements
  const lastOpenStateRef = useRef(false)
  
  // Références pour stocker les valeurs initiales (pour détecter les modifications)
  const initialFormDataRef = useRef(null)
  
  useEffect(() => {
    // Ne réinitialiser QUE quand le modal passe de fermé à ouvert
    // Pas quand le modal est déjà ouvert
    if (isOpen && !lastOpenStateRef.current) {
      // Modal vient de s'ouvrir - initialiser le formulaire
      lastOpenStateRef.current = true

      // Mode création - FORMULAIRE TOUJOURS VIDE pour création manuelle
      // Le modal d'ajout sert UNIQUEMENT à créer des dispositifs fictifs manuellement
      // La création automatique USB se fait en arrière-plan sans modal
      // NE JAMAIS pré-remplir avec les données USB, même en mode édition si c'est un dispositif USB virtuel
      if (editingItem && editingItem.id && !editingItem.isVirtual) {
        // Mode édition - charger les données du dispositif EXISTANT en base (pas virtuel)
        const initialFormData = {
          device_name: editingItem.device_name || '',
          sim_iccid: editingItem.sim_iccid || '',
          device_serial: editingItem.device_serial || '',
          firmware_version: editingItem.firmware_version || '',
          status: editingItem.status || 'inactive',
          patient_id: editingItem.patient_id || null,
          sleep_minutes: null,
          measurement_duration_ms: null,
          send_every_n_wakeups: 1,
          calibration_coefficients: [0, 1, 0],
          gps_enabled: false
        }
        setFormData(initialFormData)
        // Sauvegarder les valeurs initiales pour comparaison
        initialFormDataRef.current = JSON.parse(JSON.stringify(initialFormData))

        // Charger la configuration si disponible (mettra à jour initialFormDataRef après)
        loadDeviceConfig(editingItem.id)
      } else {
        // Mode création OU dispositif virtuel - FORMULAIRE TOUJOURS VIDE
        // Ne JAMAIS pré-remplir avec les données USB
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
          calibration_coefficients: [0, 1, 0],
          gps_enabled: false
        })
        // En mode création, pas de valeurs initiales (toujours considéré comme modifié)
        initialFormDataRef.current = null
      }

      setFormErrors({})
      setFormError(null)
    } else if (!isOpen && lastOpenStateRef.current) {
      // Modal vient de se fermer - réinitialiser le flag et les refs
      lastOpenStateRef.current = false
      initialFormDataRef.current = null
    }
    // Si le modal est déjà ouvert, ne rien faire (pas de réinitialisation)
    // NE JAMAIS réinitialiser le formulaire après l'ouverture, même si editingItem change
  }, [isOpen]) // SEULEMENT déclencher quand isOpen change - pas editingItem !

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
        const configData = {
          sleep_minutes: data.config.sleep_minutes || null,
          measurement_duration_ms: data.config.measurement_duration_ms || null,
          send_every_n_wakeups: data.config.send_every_n_wakeups || 1,
          calibration_coefficients: data.config.calibration_coefficients || [0, 1, 0],
          gps_enabled: data.config.gps_enabled || false
        }
        setFormData(prev => ({
          ...prev,
          ...configData
        }))
        // Mettre à jour les valeurs initiales avec la configuration chargée
        if (initialFormDataRef.current) {
          initialFormDataRef.current = JSON.parse(JSON.stringify({
            ...initialFormDataRef.current,
            ...configData
          }))
        }
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
  
  // Détecter si des modifications ont été faites (uniquement en mode édition)
  const hasChanges = useMemo(() => {
    if (!editingItem || !initialFormDataRef.current) {
      // En mode création, toujours considéré comme modifié
      return true
    }
    
    // Comparer formData
    const currentFormDataStr = JSON.stringify(formData)
    const initialFormDataStr = JSON.stringify(initialFormDataRef.current)
    return currentFormDataStr !== initialFormDataStr
  }, [formData, editingItem])

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
        // SIM ICCID ne peut pas être modifié - il vient de la SIM
        // En création, on peut le fournir s'il est disponible (ex: depuis USB)
        // En modification, on ne l'envoie pas pour ne pas le modifier
        sim_iccid: (!editingItem && formData.sim_iccid && formData.sim_iccid.trim().length > 0 && formData.sim_iccid !== 'N/A') 
          ? formData.sim_iccid.trim() 
          : undefined,
        device_serial: formData.device_serial && formData.device_serial.trim().length > 0 ? formData.device_serial.trim() : null,
        // Ne pas modifier firmware_version - il est en lecture seule
        status: formData.status || 'inactive',
        patient_id: formData.patient_id || null
      }
      
      // Ajouter firmware_version uniquement en création (pas en modification)
      if (!editingItem && formData.firmware_version && formData.firmware_version.trim().length > 0 && formData.firmware_version !== 'N/A') {
        devicePayload.firmware_version = formData.firmware_version.trim()
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
      if (formData.gps_enabled != null) {
        configPayload.gps_enabled = formData.gps_enabled
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
            
            // Afficher un log bleu dans le terminal pour confirmer
            if (appendLog) {
              const configSummary = Object.entries(configPayload)
                .map(([key, val]) => {
                  if (key === 'gps_enabled') return `GPS: ${val ? 'ON' : 'OFF'}`
                  if (key === 'sleep_minutes') return `Sleep: ${val}min`
                  if (key === 'measurement_duration_ms') return `Mesure: ${val}ms`
                  if (key === 'calibration_coefficients') return `Cal: [${val.join(',')}]`
                  return `${key}: ${val}`
                })
                .join(', ')
              
              appendLog(`📤 [CONFIG] UPDATE_CONFIG → ${configSummary}`, 'dashboard')
            }
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
              // Attendre que onSave termine le refetch, puis fermer le modal
              await onSave()
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

      // Appeler onSave pour rafraîchir les données et attendre qu'il se termine
      await onSave()
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
    <div className="fixed inset-0 bg-black/50 dark:bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-[rgb(var(--night-surface))] border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            {editingItem ? '✏️ Modifier le dispositif' : '➕ Créer un nouveau dispositif'}
          </h2>
          <button
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 w-8 h-8 flex items-center justify-center rounded-full transition-colors"
            onClick={onClose}
            title="Fermer"
            aria-label="Fermer"
            disabled={saving}
          >
            <span className="text-2xl font-bold leading-none">×</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {formError && <ErrorMessage message={formError} />}

          {/* Première ligne : Nom et Statut */}
          <div className="grid grid-cols-2 gap-4">
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
                <option value="inactive">⏸️ Inactif</option>
                <option value="active">✅ Actif</option>
              </select>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Le statut USB est détecté automatiquement lors de la connexion
              </p>
            </div>
          </div>

          {/* Deuxième ligne : SIM ICCID et Numéro de série */}
          <div className="grid grid-cols-2 gap-4">
            {/* SIM ICCID - Lecture seule (vient de la SIM) */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                SIM ICCID
              </label>
              <input
                type="text"
                name="sim_iccid"
                value={formData.sim_iccid || 'N/A'}
                readOnly
                disabled
                className="input w-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                placeholder="Ex: 89314404000012345678"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lecture seule (vient de la SIM)</p>
            </div>

            {/* Numéro de série */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Numéro de série {editingItem?.id && <span className="text-xs text-gray-500">(non modifiable)</span>}
              </label>
              <input
                type="text"
                name="device_serial"
                value={formData.device_serial || 'OTT-XXX (auto-généré)'}
                onChange={handleInputChange}
                disabled={!!editingItem?.id}
                className={`input w-full ${formErrors.device_serial ? 'border-red-500' : ''} ${editingItem?.id ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}`}
                placeholder="Auto-généré (OTT-001, OTT-002, etc.)"
                title={editingItem?.id ? 'Le numéro de série ne peut pas être modifié (traçabilité médicale)' : 'Sera généré automatiquement'}
              />
              {formErrors.device_serial && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.device_serial}</p>
              )}
            </div>
          </div>

          {/* Troisième ligne : Version firmware (lecture seule) et Patient */}
          <div className="grid grid-cols-2 gap-4">
            {/* Version du firmware - Lecture seule */}
            <div>
              <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                Version du firmware
              </label>
              <input
                type="text"
                name="firmware_version"
                value={formData.firmware_version || 'N/A'}
                readOnly
                disabled
                className="input w-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                placeholder="Ex: 3.8-unified"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lecture seule</p>
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
          </div>

          {/* Configuration - Accordéon */}
          <Accordion title="⚙️ Configuration" defaultOpen={editingItem ? true : false}>
            <div className="space-y-4">
              {/* Première ligne : Intervalle de veille et Durée de mesure */}
              <div className="grid grid-cols-2 gap-4">
                {/* Intervalle de veille */}
                <div>
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
                <div>
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
              </div>

              {/* GPS Toggle */}
              <div className="flex items-center justify-between p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">📍</span>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                      GPS
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {formData.gps_enabled ? '✅ Géolocalisation active' : '⚠️ OFF (économie batterie)'}
                    </p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    name="gps_enabled"
                    checked={formData.gps_enabled || false}
                    onChange={(e) => setFormData(prev => ({ ...prev, gps_enabled: e.target.checked }))}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              {/* Deuxième ligne : Envoyer toutes les N réveils */}
              <div>
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
          </Accordion>

          {/* Boutons */}
          <div className="flex gap-2 justify-end pt-4 border-t border-gray-200 dark:border-gray-700">
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
              disabled={saving || loadingConfig || (editingItem && !hasChanges)}
              title={editingItem && !hasChanges ? 'Aucune modification détectée' : undefined}
            >
              {saving ? '⏳ Enregistrement...' : (editingItem ? '💾 Enregistrer les modifications' : '✅ Créer le dispositif')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

