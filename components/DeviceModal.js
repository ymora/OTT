'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { fetchJson } from '@/lib/api'
import ErrorMessage from '@/components/ErrorMessage'
import logger from '@/lib/logger'
import { useUsb } from '@/contexts/UsbContext'
import { buildUpdateConfigPayload } from '@/lib/deviceCommands'

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
  // Contexte USB pour détecter la connexion et envoyer des commandes
  const { 
    isConnected: usbIsConnected, 
    port, 
    write: usbWrite,
    usbConnectedDevice,
    usbVirtualDevice
  } = useUsb()
  const [formData, setFormData] = useState({
    device_name: '',
    sim_iccid: '',
    device_serial: '',
    firmware_version: '',
    status: 'inactive',
    patient_id: null,
    // Mesure
    sleep_minutes: null,
    measurement_duration_ms: null,
    send_every_n_wakeups: 1,
    calibration_coefficients: [0, 1, 0],
    gps_enabled: false,
    // Airflow
    airflow_passes: null,
    airflow_samples_per_pass: null,
    airflow_delay_ms: null,
    // Modem
    watchdog_seconds: null,
    modem_boot_timeout_ms: null,
    sim_ready_timeout_ms: null,
    network_attach_timeout_ms: null,
    modem_max_reboots: null,
    // Réseau
    apn: '',
    sim_pin: '',
    // OTA
    ota_primary_url: '',
    ota_fallback_url: '',
    ota_md5: ''
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
          gps_enabled: false,
          airflow_passes: null,
          airflow_samples_per_pass: null,
          airflow_delay_ms: null,
          watchdog_seconds: null,
          modem_boot_timeout_ms: null,
          sim_ready_timeout_ms: null,
          network_attach_timeout_ms: null,
          modem_max_reboots: null,
          apn: '',
          sim_pin: '',
          ota_primary_url: '',
          ota_fallback_url: '',
          ota_md5: ''
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
          gps_enabled: false,
          airflow_passes: null,
          airflow_samples_per_pass: null,
          airflow_delay_ms: null,
          watchdog_seconds: null,
          modem_boot_timeout_ms: null,
          sim_ready_timeout_ms: null,
          network_attach_timeout_ms: null,
          modem_max_reboots: null,
          apn: '',
          sim_pin: '',
          ota_primary_url: '',
          ota_fallback_url: '',
          ota_md5: ''
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
        // Convertir les valeurs pour l'affichage (ms → sec, sec → min)
        const configData = {
          sleep_minutes: data.config.sleep_minutes || null,
          // Convertir ms → sec pour l'affichage (garder comme nombre pour les inputs)
          measurement_duration_ms: data.config.measurement_duration_ms != null 
            ? parseFloat((data.config.measurement_duration_ms / 1000).toFixed(1))
            : null,
          send_every_n_wakeups: data.config.send_every_n_wakeups || 1,
          calibration_coefficients: data.config.calibration_coefficients || [0, 1, 0],
          gps_enabled: data.config.gps_enabled || false,
          airflow_passes: data.config.airflow_passes || null,
          airflow_samples_per_pass: data.config.airflow_samples_per_pass || null,
          // Convertir ms → sec pour l'affichage (garder comme nombre)
          airflow_delay_ms: data.config.airflow_delay_ms != null 
            ? parseFloat((data.config.airflow_delay_ms / 1000).toFixed(3))
            : null,
          // Convertir sec → min pour l'affichage (garder comme nombre)
          watchdog_seconds: data.config.watchdog_seconds != null 
            ? parseFloat((data.config.watchdog_seconds / 60).toFixed(1))
            : null,
          // Convertir ms → sec pour l'affichage (garder comme nombre)
          modem_boot_timeout_ms: data.config.modem_boot_timeout_ms != null 
            ? parseFloat((data.config.modem_boot_timeout_ms / 1000).toFixed(1))
            : null,
          // Convertir ms → sec pour l'affichage (garder comme nombre)
          sim_ready_timeout_ms: data.config.sim_ready_timeout_ms != null 
            ? parseFloat((data.config.sim_ready_timeout_ms / 1000).toFixed(1))
            : null,
          // Convertir ms → sec pour l'affichage (garder comme nombre)
          network_attach_timeout_ms: data.config.network_attach_timeout_ms != null 
            ? parseFloat((data.config.network_attach_timeout_ms / 1000).toFixed(1))
            : null,
          modem_max_reboots: data.config.modem_max_reboots || null,
          apn: data.config.apn || '',
          sim_pin: data.config.sim_pin || '',
          ota_primary_url: data.config.ota_primary_url || '',
          ota_fallback_url: data.config.ota_fallback_url || '',
          ota_md5: data.config.ota_md5 || ''
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
  
  // Fonctions de conversion pour l'affichage
  // Convertir ms → sec pour l'affichage
  const msToSec = (ms) => ms != null ? (ms / 1000).toFixed(1) : ''
  // Convertir sec → ms pour la sauvegarde
  const secToMs = (sec) => sec != null ? Math.round(parseFloat(sec) * 1000) : null
  // Convertir sec → min pour l'affichage
  const secToMin = (sec) => sec != null ? (sec / 60).toFixed(1) : ''
  // Convertir min → sec pour la sauvegarde
  const minToSec = (min) => min != null ? Math.round(parseFloat(min) * 60) : null
  
  // Gérer les changements avec conversion automatique
  const handleInputChangeWithConversion = (e) => {
    const { name, value, type, checked } = e.target
    
    let convertedValue = value
    
    // Conversion selon le type de champ
    if (type === 'number' && value !== '') {
      const numValue = parseFloat(value)
      
      // Champs en millisecondes (affichés en secondes)
      if (name === 'measurement_duration_ms' || 
          name === 'airflow_delay_ms' || 
          name === 'modem_boot_timeout_ms' || 
          name === 'sim_ready_timeout_ms' || 
          name === 'network_attach_timeout_ms') {
        // L'utilisateur saisit en secondes, on stocke en secondes pour l'affichage
        // La conversion en ms se fera à la sauvegarde
        convertedValue = numValue
      }
      // Champs en secondes (affichés en minutes)
      else if (name === 'watchdog_seconds') {
        // L'utilisateur saisit en minutes, on stocke en minutes pour l'affichage
        // La conversion en secondes se fera à la sauvegarde
        convertedValue = numValue
      }
      // Autres champs numériques
      else {
        convertedValue = numValue
      }
    } else if (type === 'number' && value === '') {
      convertedValue = null
    } else if (type === 'checkbox') {
      convertedValue = checked
    } else {
      convertedValue = value
    }
    
    const newFormData = {
      ...formData,
      [name]: convertedValue
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
  
  // Vérifier si le dispositif est connecté en USB
  const isDeviceUsbConnected = useMemo(() => {
    if (!editingItem || !usbIsConnected || !port) return false
    const currentUsbDevice = usbConnectedDevice || usbVirtualDevice
    if (!currentUsbDevice) return false
    
    // Vérifier si l'ICCID ou le serial correspond
    return (
      (editingItem.sim_iccid && currentUsbDevice.sim_iccid === editingItem.sim_iccid) ||
      (editingItem.device_serial && currentUsbDevice.device_serial === editingItem.device_serial)
    )
  }, [editingItem, usbIsConnected, port, usbConnectedDevice, usbVirtualDevice])
  
  // Envoyer la configuration via USB (prioritaire) ou OTA
  const sendConfigToDevice = async (configPayload, deviceId) => {
    if (isDeviceUsbConnected && usbWrite && port) {
      // Envoi via USB (prioritaire)
      try {
        // Mapper les noms de propriétés pour buildUpdateConfigPayload
        const mappedConfig = {
          sleepMinutes: configPayload.sleep_minutes,
          sleep_minutes: configPayload.sleep_minutes, // Support des deux formats
          measurementDurationMs: configPayload.measurement_duration_ms,
          measurement_duration_ms: configPayload.measurement_duration_ms,
          sendEveryNWakeups: configPayload.send_every_n_wakeups,
          send_every_n_wakeups: configPayload.send_every_n_wakeups,
          calibration_coefficients: configPayload.calibration_coefficients,
          gps_enabled: configPayload.gps_enabled,
          airflowPasses: configPayload.airflow_passes,
          airflowSamples: configPayload.airflow_samples_per_pass,
          airflowDelay: configPayload.airflow_delay_ms,
          watchdogSeconds: configPayload.watchdog_seconds,
          modemBootTimeout: configPayload.modem_boot_timeout_ms,
          simReadyTimeout: configPayload.sim_ready_timeout_ms,
          networkAttachTimeout: configPayload.network_attach_timeout_ms,
          modemReboots: configPayload.modem_max_reboots,
          apn: configPayload.apn,
          simPin: configPayload.sim_pin,
          otaPrimaryUrl: configPayload.ota_primary_url,
          otaFallbackUrl: configPayload.ota_fallback_url,
          otaMd5: configPayload.ota_md5
        }
        const payload = buildUpdateConfigPayload(mappedConfig)
        const command = JSON.stringify({
          command: 'UPDATE_CONFIG',
          payload: payload
        })
        const commandWithNewline = command + '\n'
        
        if (appendLog) {
          appendLog(`📤 [USB] Envoi configuration directement via USB...`, 'dashboard')
        }
        
        await usbWrite(commandWithNewline)
        
        if (appendLog) {
          appendLog(`✅ [USB] Configuration envoyée via USB`, 'dashboard')
        }
        
        return { success: true, method: 'USB' }
      } catch (err) {
        logger.error('Erreur envoi config USB:', err)
        if (appendLog) {
          appendLog(`❌ [USB] Erreur envoi: ${err.message}`, 'dashboard')
        }
        // Fallback sur OTA en cas d'erreur USB
        throw err
      }
    } else {
      // Envoi via OTA (fallback)
      try {
        await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/devices/${deviceId}/config`,
          {
            method: 'PUT',
            body: JSON.stringify(configPayload)
          },
          { requiresAuth: true }
        )
        
        if (appendLog) {
          appendLog(`📡 [OTA] Configuration envoyée via OTA (dispositif non connecté en USB)`, 'dashboard')
        }
        
        return { success: true, method: 'OTA' }
      } catch (err) {
        logger.error('Erreur envoi config OTA:', err)
        throw err
      }
    }
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
        status: formData.status || 'inactive'
        // patient_id est géré via l'assignation dans le tableau des dispositifs, pas dans ce modal
      }
      
      // Ajouter firmware_version uniquement en création (pas en modification)
      if (!editingItem && formData.firmware_version && formData.firmware_version.trim().length > 0 && formData.firmware_version !== 'N/A') {
        devicePayload.firmware_version = formData.firmware_version.trim()
      }

      // Préparer la configuration avec reconversion (sec → ms, min → sec)
      // Note: sleep_minutes sera mappé vers sleep_minutes_default par buildUpdateConfigPayload
      const configPayload = {}
      if (formData.sleep_minutes != null) {
        configPayload.sleep_minutes = parseInt(formData.sleep_minutes)
      }
      // Convertir sec → ms pour la sauvegarde
      if (formData.measurement_duration_ms != null) {
        configPayload.measurement_duration_ms = Math.round(parseFloat(formData.measurement_duration_ms) * 1000)
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
      // Airflow
      if (formData.airflow_passes != null) {
        configPayload.airflow_passes = parseInt(formData.airflow_passes)
      }
      if (formData.airflow_samples_per_pass != null) {
        configPayload.airflow_samples_per_pass = parseInt(formData.airflow_samples_per_pass)
      }
      // Convertir sec → ms pour la sauvegarde
      if (formData.airflow_delay_ms != null) {
        configPayload.airflow_delay_ms = Math.round(parseFloat(formData.airflow_delay_ms) * 1000)
      }
      // Modem
      // Convertir min → sec pour la sauvegarde
      if (formData.watchdog_seconds != null) {
        configPayload.watchdog_seconds = Math.round(parseFloat(formData.watchdog_seconds) * 60)
      }
      // Convertir sec → ms pour la sauvegarde
      if (formData.modem_boot_timeout_ms != null) {
        configPayload.modem_boot_timeout_ms = Math.round(parseFloat(formData.modem_boot_timeout_ms) * 1000)
      }
      // Convertir sec → ms pour la sauvegarde
      if (formData.sim_ready_timeout_ms != null) {
        configPayload.sim_ready_timeout_ms = Math.round(parseFloat(formData.sim_ready_timeout_ms) * 1000)
      }
      // Convertir sec → ms pour la sauvegarde
      if (formData.network_attach_timeout_ms != null) {
        configPayload.network_attach_timeout_ms = Math.round(parseFloat(formData.network_attach_timeout_ms) * 1000)
      }
      if (formData.modem_max_reboots != null) {
        configPayload.modem_max_reboots = parseInt(formData.modem_max_reboots)
      }
      // Réseau
      if (formData.apn && formData.apn.trim()) {
        configPayload.apn = formData.apn.trim()
      }
      if (formData.sim_pin && formData.sim_pin.trim()) {
        configPayload.sim_pin = formData.sim_pin.trim()
      }
      // OTA
      if (formData.ota_primary_url && formData.ota_primary_url.trim()) {
        configPayload.ota_primary_url = formData.ota_primary_url.trim()
      }
      if (formData.ota_fallback_url && formData.ota_fallback_url.trim()) {
        configPayload.ota_fallback_url = formData.ota_fallback_url.trim()
      }
      if (formData.ota_md5 && formData.ota_md5.trim()) {
        configPayload.ota_md5 = formData.ota_md5.trim()
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
            const result = await sendConfigToDevice(configPayload, editingItem.id)
            
            // Comparer les valeurs initiales avec les nouvelles pour détecter les changements
            const changes = []
            const initialData = initialFormDataRef.current || {}
            
            // Fonction helper pour formater les valeurs
            const formatValue = (key, val) => {
              if (key === 'gps_enabled') return val ? 'ON' : 'OFF'
              if (key === 'sleep_minutes') return `${val}min`
              if (key === 'measurement_duration_ms') return `${(val/1000).toFixed(1)}s`
              if (key === 'send_every_n_wakeups') return `${val}`
              if (key === 'calibration_coefficients') return `[${val.join(',')}]`
              if (key === 'airflow_passes') return `${val}`
              if (key === 'airflow_samples_per_pass') return `${val}`
              if (key === 'airflow_delay_ms') return `${(val/1000).toFixed(3)}s`
              if (key === 'watchdog_seconds') return `${(val/60).toFixed(1)}min`
              if (key === 'modem_boot_timeout_ms') return `${(val/1000).toFixed(1)}s`
              if (key === 'sim_ready_timeout_ms') return `${(val/1000).toFixed(1)}s`
              if (key === 'network_attach_timeout_ms') return `${(val/1000).toFixed(1)}s`
              if (key === 'modem_max_reboots') return `${val}`
              if (key === 'apn') return val
              if (key === 'sim_pin') return '***'
              if (key === 'ota_primary_url') return val.length > 30 ? val.substring(0, 30) + '...' : val
              if (key === 'ota_fallback_url') return val.length > 30 ? val.substring(0, 30) + '...' : val
              if (key === 'ota_md5') return val.length > 16 ? val.substring(0, 16) + '...' : val
              return String(val)
            }
            
            // Détecter les changements dans la configuration
            Object.entries(configPayload).forEach(([key, newVal]) => {
              // Convertir les valeurs pour comparaison (gérer les conversions sec→ms, min→sec)
              let oldVal = initialData[key]
              
              // Conversions pour comparaison
              if (key === 'measurement_duration_ms' && oldVal != null) {
                oldVal = Math.round(parseFloat(oldVal) * 1000)
              } else if (key === 'airflow_delay_ms' && oldVal != null) {
                oldVal = Math.round(parseFloat(oldVal) * 1000)
              } else if (key === 'watchdog_seconds' && oldVal != null) {
                oldVal = Math.round(parseFloat(oldVal) * 60)
              } else if (key === 'modem_boot_timeout_ms' && oldVal != null) {
                oldVal = Math.round(parseFloat(oldVal) * 1000)
              } else if (key === 'sim_ready_timeout_ms' && oldVal != null) {
                oldVal = Math.round(parseFloat(oldVal) * 1000)
              } else if (key === 'network_attach_timeout_ms' && oldVal != null) {
                oldVal = Math.round(parseFloat(oldVal) * 1000)
              }
              
              // Comparer les valeurs (gérer les cas spéciaux)
              let hasChanged = false
              if (key === 'calibration_coefficients') {
                hasChanged = !oldVal || !Array.isArray(oldVal) || 
                  oldVal.length !== newVal.length ||
                  oldVal.some((v, i) => Math.abs(v - newVal[i]) > 0.001)
              } else if (key === 'gps_enabled') {
                hasChanged = oldVal !== newVal
              } else if (oldVal === null || oldVal === undefined || oldVal === '') {
                hasChanged = newVal !== null && newVal !== undefined && newVal !== ''
              } else {
                hasChanged = oldVal !== newVal
              }
              
              if (hasChanged) {
                // Utiliser les valeurs originales pour l'affichage (pas les valeurs converties)
                const oldDisplay = initialData[key]
                const oldFormatted = oldDisplay !== null && oldDisplay !== undefined && oldDisplay !== '' 
                  ? formatValue(key, oldDisplay) 
                  : '(vide)'
                const newFormatted = formatValue(key, newVal)
                
                // Noms lisibles pour les clés
                const keyNames = {
                  'gps_enabled': 'GPS',
                  'sleep_minutes': 'Sommeil',
                  'measurement_duration_ms': 'Durée mesure',
                  'send_every_n_wakeups': 'Envoi tous les N wakeups',
                  'calibration_coefficients': 'Calibration',
                  'airflow_passes': 'Passes airflow',
                  'airflow_samples_per_pass': 'Échantillons/passe',
                  'airflow_delay_ms': 'Délai airflow',
                  'watchdog_seconds': 'Watchdog',
                  'modem_boot_timeout_ms': 'Timeout boot modem',
                  'sim_ready_timeout_ms': 'Timeout SIM',
                  'network_attach_timeout_ms': 'Timeout réseau',
                  'modem_max_reboots': 'Max redémarrages',
                  'apn': 'APN',
                  'sim_pin': 'PIN SIM',
                  'ota_primary_url': 'OTA primaire',
                  'ota_fallback_url': 'OTA secours',
                  'ota_md5': 'MD5 OTA'
                }
                
                changes.push(`${keyNames[key] || key}: ${oldFormatted} → ${newFormatted}`)
              }
            })
            
            // Détecter les changements dans les données du dispositif
            if (initialData.device_name !== devicePayload.device_name) {
              changes.push(`Nom: "${initialData.device_name || '(vide)'}" → "${devicePayload.device_name}"`)
            }
            if (initialData.device_serial !== devicePayload.device_serial) {
              const oldSerial = initialData.device_serial || '(vide)'
              const newSerial = devicePayload.device_serial || '(vide)'
              if (oldSerial !== newSerial) {
                changes.push(`Serial: "${oldSerial}" → "${newSerial}"`)
              }
            }
            if (initialData.status !== devicePayload.status) {
              changes.push(`Statut: ${initialData.status || '(vide)'} → ${devicePayload.status}`)
            }
            
            // Afficher un log bleu dans le terminal pour confirmer
            if (appendLog) {
              const configSummary = Object.entries(configPayload)
                .map(([key, val]) => {
                  if (key === 'gps_enabled') return `GPS: ${val ? 'ON' : 'OFF'}`
                  if (key === 'sleep_minutes') return `Sleep: ${val}min`
                  if (key === 'measurement_duration_ms') return `Durée: ${val}ms (${(val/1000).toFixed(1)}s)`
                  if (key === 'send_every_n_wakeups') return `Envoi: ${val}`
                  if (key === 'calibration_coefficients') return `Cal: [${val.join(',')}]`
                  if (key === 'airflow_passes') return `Passes: ${val}`
                  if (key === 'airflow_samples_per_pass') return `Samples: ${val}`
                  if (key === 'airflow_delay_ms') return `Délai: ${val}ms (${(val/1000).toFixed(3)}s)`
                  if (key === 'watchdog_seconds') return `Watchdog: ${val}s (${(val/60).toFixed(1)}min)`
                  if (key === 'modem_boot_timeout_ms') return `Boot: ${val}ms (${(val/1000).toFixed(1)}s)`
                  if (key === 'sim_ready_timeout_ms') return `SIM: ${val}ms (${(val/1000).toFixed(1)}s)`
                  if (key === 'network_attach_timeout_ms') return `Network: ${val}ms (${(val/1000).toFixed(1)}s)`
                  if (key === 'modem_max_reboots') return `Reboots: ${val}`
                  if (key === 'apn') return `APN: ${val}`
                  if (key === 'sim_pin') return `PIN: ***`
                  if (key === 'ota_primary_url') return `OTA1: ${val.substring(0, 30)}...`
                  if (key === 'ota_fallback_url') return `OTA2: ${val.substring(0, 30)}...`
                  if (key === 'ota_md5') return `MD5: ${val.substring(0, 16)}...`
                  return `${key}: ${val}`
                })
                .join(', ')
              
              appendLog(`📤 [CONFIG] UPDATE_CONFIG (${result.method}) → ${configSummary}`, 'dashboard')
            }
            
            // Message de succès avec les changements détectés
            if (changes.length > 0) {
              const changesText = changes.join(', ')
              logger.log(`✅ Dispositif "${devicePayload.device_name}" mis à jour: ${changesText}`)
            } else {
              logger.log(`✅ Dispositif "${devicePayload.device_name}" mis à jour (aucun changement détecté)`)
            }
            
            // Si envoyé via USB, sauvegarder aussi en base pour cohérence
            if (result.method === 'USB') {
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
              } catch (dbErr) {
                logger.warn('⚠️ Erreur sauvegarde config en base (après envoi USB):', dbErr)
                // Ne pas bloquer, la config a déjà été envoyée au dispositif
              }
            }
          } catch (configErr) {
            logger.warn('⚠️ Erreur mise à jour configuration:', configErr)
            // Ne pas bloquer si la config échoue
          }
        }

        // Détecter les changements dans les données du dispositif (sans config)
        const changes = []
        const initialData = initialFormDataRef.current || {}
        
        if (initialData.device_name !== devicePayload.device_name) {
          changes.push(`Nom: "${initialData.device_name || '(vide)'}" → "${devicePayload.device_name}"`)
        }
        if (initialData.device_serial !== devicePayload.device_serial) {
          const oldSerial = initialData.device_serial || '(vide)'
          const newSerial = devicePayload.device_serial || '(vide)'
          if (oldSerial !== newSerial) {
            changes.push(`Serial: "${oldSerial}" → "${newSerial}"`)
          }
        }
        if (initialData.status !== devicePayload.status) {
          changes.push(`Statut: ${initialData.status || '(vide)'} → ${devicePayload.status}`)
        }
        
        if (changes.length > 0) {
          const changesText = changes.join(', ')
          logger.log(`✅ Dispositif "${devicePayload.device_name}" modifié: ${changesText}`)
        } else {
          logger.log(`✅ Dispositif "${devicePayload.device_name}" modifié (aucun changement détecté)`)
        }
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
              await sendConfigToDevice(configPayload, existingDevice.id)
            } catch (configErr) {
              logger.warn('⚠️ Erreur mise à jour configuration:', configErr)
            }
          }

          // Détecter les changements
          const changes = []
          const initialData = initialFormDataRef.current || {}
          
          if (initialData.device_name !== devicePayload.device_name) {
            changes.push(`Nom: "${initialData.device_name || '(vide)'}" → "${devicePayload.device_name}"`)
          }
          if (initialData.device_serial !== devicePayload.device_serial) {
            const oldSerial = initialData.device_serial || '(vide)'
            const newSerial = devicePayload.device_serial || '(vide)'
            if (oldSerial !== newSerial) {
              changes.push(`Serial: "${oldSerial}" → "${newSerial}"`)
            }
          }
          if (initialData.status !== devicePayload.status) {
            changes.push(`Statut: ${initialData.status || '(vide)'} → ${devicePayload.status}`)
          }
          
          if (changes.length > 0) {
            const changesText = changes.join(', ')
            logger.log(`✅ Dispositif "${devicePayload.device_name}" mis à jour: ${changesText}`)
          } else {
            logger.log(`✅ Dispositif "${devicePayload.device_name}" mis à jour (aucun changement détecté)`)
          }
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
              // Vérifier si le nouveau dispositif est connecté en USB
              const newDeviceUsbConnected = usbIsConnected && port && (
                (data.device.sim_iccid && (usbConnectedDevice?.sim_iccid === data.device.sim_iccid || usbVirtualDevice?.sim_iccid === data.device.sim_iccid)) ||
                (data.device.device_serial && (usbConnectedDevice?.device_serial === data.device.device_serial || usbVirtualDevice?.device_serial === data.device.device_serial))
              )
              
              if (newDeviceUsbConnected && usbWrite) {
                // Envoi via USB
                const payload = buildUpdateConfigPayload(configPayload)
                const command = JSON.stringify({
                  command: 'UPDATE_CONFIG',
                  payload: payload
                })
                await usbWrite(command + '\n')
                logger.log('✅ Configuration envoyée via USB')
              }
              
              // Toujours sauvegarder en base
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
      <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-xl shadow-2xl w-full max-w-4xl max-h-[95vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-[rgb(var(--night-surface))] border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              {editingItem ? '✏️ Modifier le dispositif' : '➕ Créer un nouveau dispositif'}
            </h2>
            {editingItem && isDeviceUsbConnected && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-1 flex items-center gap-1">
                🔌 Connecté en USB - Configuration envoyée directement
              </p>
            )}
            {editingItem && !isDeviceUsbConnected && (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                📡 Non connecté - Configuration envoyée via OTA
              </p>
            )}
          </div>
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

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-3">
          {formError && <ErrorMessage message={formError} />}

          {/* Première ligne : Nom et Statut */}
          <div className="grid grid-cols-2 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
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

          {/* Troisième ligne : Version firmware (lecture seule) */}
          <div className="grid grid-cols-1 gap-3">
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
          </div>

          {/* Configuration - Accordéons par catégorie */}
          <div className="space-y-2">
            {/* Mesure - Accordéon principal (ouvert par défaut) */}
            <Accordion title="📊 Mesure" defaultOpen={true}>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                      ⏰ Veille (min)
                    </label>
                    <input
                      type="number"
                      name="sleep_minutes"
                      value={formData.sleep_minutes || ''}
                      onChange={handleInputChange}
                      className="input w-full text-sm py-1.5"
                      placeholder="1440 (24h)"
                      min="1"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Par défaut: 1440 min (24h) - Intervalle entre envois OTA
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                      ⏱️ Durée (sec)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      name="measurement_duration_ms"
                      value={formData.measurement_duration_ms || ''}
                      onChange={handleInputChangeWithConversion}
                      className="input w-full text-sm py-1.5"
                      placeholder="5.0"
                      min="0.1"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                      📤 Envoi (N réveils)
                    </label>
                    <input
                      type="number"
                      name="send_every_n_wakeups"
                      value={formData.send_every_n_wakeups || 1}
                      onChange={handleInputChange}
                      className="input w-full text-sm py-1.5"
                      min="1"
                      placeholder="1"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-3">
                    <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
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
                          className="input w-full text-sm py-1.5"
                          placeholder={`a${index}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <div className="w-full">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                        📍 GPS
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer w-full justify-center">
                        <input
                          type="checkbox"
                          name="gps_enabled"
                          checked={formData.gps_enabled || false}
                          onChange={(e) => setFormData(prev => ({ ...prev, gps_enabled: e.target.checked }))}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>

            {/* Airflow - Accordéon fermé */}
            <Accordion title="💨 Airflow" defaultOpen={false}>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Passes
                  </label>
                  <input
                    type="number"
                    name="airflow_passes"
                    value={formData.airflow_passes || ''}
                    onChange={handleInputChange}
                    className="input w-full text-sm py-1.5"
                    placeholder="2"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Échantillons/passe
                  </label>
                  <input
                    type="number"
                    name="airflow_samples_per_pass"
                    value={formData.airflow_samples_per_pass || ''}
                    onChange={handleInputChange}
                    className="input w-full text-sm py-1.5"
                    placeholder="10"
                    min="1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Délai (sec)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="airflow_delay_ms"
                    value={formData.airflow_delay_ms || ''}
                    onChange={handleInputChangeWithConversion}
                    className="input w-full text-sm py-1.5"
                    placeholder="0.005"
                    min="0.001"
                  />
                </div>
              </div>
            </Accordion>

            {/* Modem - Accordéon fermé */}
            <Accordion title="📡 Modem" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Watchdog (min)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="watchdog_seconds"
                    value={formData.watchdog_seconds || ''}
                    onChange={handleInputChangeWithConversion}
                    className="input w-full text-sm py-1.5"
                    placeholder="5.0"
                    min="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Boot timeout (sec)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="modem_boot_timeout_ms"
                    value={formData.modem_boot_timeout_ms || ''}
                    onChange={handleInputChangeWithConversion}
                    className="input w-full text-sm py-1.5"
                    placeholder="30.0"
                    min="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    SIM ready timeout (sec)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="sim_ready_timeout_ms"
                    value={formData.sim_ready_timeout_ms || ''}
                    onChange={handleInputChangeWithConversion}
                    className="input w-full text-sm py-1.5"
                    placeholder="10.0"
                    min="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Network attach timeout (sec)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    name="network_attach_timeout_ms"
                    value={formData.network_attach_timeout_ms || ''}
                    onChange={handleInputChangeWithConversion}
                    className="input w-full text-sm py-1.5"
                    placeholder="60.0"
                    min="0.1"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    Max reboots
                  </label>
                  <input
                    type="number"
                    name="modem_max_reboots"
                    value={formData.modem_max_reboots || ''}
                    onChange={handleInputChange}
                    className="input w-full text-sm py-1.5"
                    placeholder="3"
                    min="0"
                  />
                </div>
              </div>
            </Accordion>

            {/* Réseau - Accordéon fermé */}
            <Accordion title="🌐 Réseau" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    APN <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="apn"
                    value={formData.apn || ''}
                    onChange={handleInputChange}
                    className="input w-full text-sm py-1.5"
                    placeholder="free, orange, sl2sfr, internet..."
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Free: <code className="text-xs">free</code> | Orange: <code className="text-xs">orange</code> | SFR: <code className="text-xs">sl2sfr</code> | Bouygues: <code className="text-xs">mmsbouygtel</code>
                  </p>
                  {!formData.apn && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                      ⚠️ APN requis pour la connexion réseau (oper, eps, gprs)
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    SIM PIN
                  </label>
                  <input
                    type="password"
                    name="sim_pin"
                    value={formData.sim_pin || ''}
                    onChange={handleInputChange}
                    className="input w-full text-sm py-1.5"
                    placeholder="0000"
                  />
                </div>
              </div>
            </Accordion>

            {/* OTA - Accordéon fermé */}
            <Accordion title="🔄 OTA" defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    URL primaire
                  </label>
                  <input
                    type="url"
                    name="ota_primary_url"
                    value={formData.ota_primary_url || ''}
                    onChange={handleInputChange}
                    className="input w-full text-sm py-1.5"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    URL de secours
                  </label>
                  <input
                    type="url"
                    name="ota_fallback_url"
                    value={formData.ota_fallback_url || ''}
                    onChange={handleInputChange}
                    className="input w-full text-sm py-1.5"
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300">
                    MD5 attendu (vérification)
                  </label>
                  <input
                    type="text"
                    name="ota_md5"
                    value={formData.ota_md5 || ''}
                    onChange={handleInputChange}
                    className="input w-full text-sm py-1.5 font-mono"
                    placeholder="a1b2c3d4e5f6..."
                    pattern="[a-fA-F0-9]{32}"
                    title="32 caractères hexadécimaux"
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Hash MD5 pour vérifier l'intégrité du firmware OTA
                  </p>
                </div>
              </div>
            </Accordion>
          </div>

          {/* Boutons */}
          <div className="flex gap-2 justify-end pt-3 border-t border-gray-200 dark:border-gray-700">
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

