'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { fetchJson } from '@/lib/api'
import ErrorMessage from '@/components/ErrorMessage'
import Tooltip from '@/components/Tooltip'
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
    usbDevice,
    usbDeviceInfo // Données reçues du dispositif USB (inclut config)
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
    send_every_n_wakeups: null,
    calibration_coefficients: null,
    gps_enabled: null,
    roaming_enabled: null,
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
    operator: '', // Opérateur sélectionné (Orange, Free, SFR, Bouygues, ou vide pour automatique)
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
  const [configTab, setConfigTab] = useState('basic') // basic, advanced

  // Initialiser le formulaire UNIQUEMENT lors de l'ouverture du modal
  // Utiliser un ref pour éviter les réinitialisations lors de changements
  const lastOpenStateRef = useRef(false)
  
  // Références pour stocker les valeurs initiales (pour détecter les modifications)
  const initialFormDataRef = useRef(null)
  // Référence pour mémoriser le dernier état de hasChanges (éviter les faux positifs lors des re-renders)
  const lastHasChangesRef = useRef(false)
  
  useEffect(() => {
    // Ne réinitialiser QUE quand le modal passe de fermé à ouvert
    // Pas quand le modal est déjà ouvert
    if (isOpen && !lastOpenStateRef.current) {
      // Modal vient de s'ouvrir - initialiser le formulaire
      lastOpenStateRef.current = true

      // Dispositif USB connecté (peut être enregistré ou non)
      const currentUsbDevice = usbDevice
      
      // Normaliser les identifiants pour comparaison
      const normalizeId = (val) => val ? String(val).trim().replace(/\s+/g, '') : ''
      
      // Vérifier si editingItem est un dispositif non enregistré (pas d'ID réel de base de données)
      const isNotRegistered = !editingItem?.id || 
        (typeof editingItem.id === 'string' && editingItem.id.startsWith('usb-')) ||
        editingItem?.isVirtual || 
        editingItem?.isTemporary
      
      // Vérifier si le dispositif est connecté en USB
      const isUsbConnected = usbIsConnected && port && currentUsbDevice && editingItem && (
        isNotRegistered ||
        (editingItem.sim_iccid && currentUsbDevice.sim_iccid && normalizeId(editingItem.sim_iccid) === normalizeId(currentUsbDevice.sim_iccid)) ||
        (editingItem.device_serial && currentUsbDevice.device_serial && normalizeId(editingItem.device_serial) === normalizeId(currentUsbDevice.device_serial))
      )
      
      // Récupérer la configuration USB si disponible (priorité: editingItem > usbDevice > usbDeviceInfo)
      const usbConfig = (isUsbConnected || isNotRegistered)
        ? (editingItem?.config || currentUsbDevice?.config || usbDeviceInfo?.config || null)
        : null

      // Mode création - FORMULAIRE TOUJOURS VIDE pour création manuelle
      // Le modal d'ajout sert UNIQUEMENT à créer des dispositifs fictifs manuellement
      // La création automatique USB se fait en arrière-plan sans modal
      if (editingItem && editingItem.id && !editingItem.isVirtual && !isUsbConnected) {
        // Mode édition - dispositif en base NON connecté en USB
        // Charger uniquement depuis la base de données
        const initialFormData = {
          device_name: editingItem.device_name || '',
          sim_iccid: editingItem.sim_iccid || '',
          device_serial: editingItem.device_serial || '',
          firmware_version: editingItem.firmware_version || '',
          status: editingItem.status || 'inactive',
          patient_id: editingItem.patient_id || null,
          // Toutes les valeurs de configuration seront chargées depuis la base via loadDeviceConfig
          sleep_minutes: null,
          measurement_duration_ms: null,
          send_every_n_wakeups: null,
          calibration_coefficients: null,
          gps_enabled: null,
          roaming_enabled: null,
          airflow_passes: null,
          airflow_samples_per_pass: null,
          airflow_delay_ms: null,
          watchdog_seconds: null,
          modem_boot_timeout_ms: null,
          sim_ready_timeout_ms: null,
          network_attach_timeout_ms: null,
          modem_max_reboots: null,
          apn: '',
          operator: '',
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
        // Mode création OU dispositif virtuel OU dispositif en base connecté en USB
        // Pré-remplir avec les données USB si disponibles, sinon depuis la base
        // Générer un nom intelligent depuis les identifiants disponibles
        let defaultDeviceName = ''
        if (editingItem) {
          // Si c'est un dispositif virtuel ou en base, utiliser son nom ou générer un nom depuis les identifiants
          if (editingItem.device_name && editingItem.device_name !== 'USB-En attente...' && editingItem.device_name !== 'USB-Device') {
            defaultDeviceName = editingItem.device_name
          } else if (editingItem.sim_iccid) {
            // Utiliser les 4 derniers chiffres de l'ICCID pour générer un nom
            defaultDeviceName = `OTT-${editingItem.sim_iccid.slice(-4)}`
          } else if (editingItem.device_serial) {
            defaultDeviceName = editingItem.device_serial
          } else {
            // Si aucun identifiant, utiliser un nom générique mais avec timestamp pour éviter les doublons
            defaultDeviceName = `USB-Device-${Date.now().toString().slice(-4)}`
          }
        } else {
          // Mode création sans dispositif virtuel - nom par défaut
          defaultDeviceName = 'USB-Device'
        }
        
        // Logger pour debug
        if (usbConfig) {
          logger.log('[DeviceModal] ✅ Configuration USB trouvée, pré-remplissage automatique:', {
            sleep_minutes: usbConfig.sleep_minutes,
            measurement_duration_ms: usbConfig.measurement_duration_ms,
            calibration: usbConfig.calibration_coefficients,
            airflow_passes: usbConfig.airflow_passes,
            airflow_samples: usbConfig.airflow_samples_per_pass,
            airflow_delay: usbConfig.airflow_delay_ms,
            gps_enabled: usbConfig.gps_enabled,
            roaming_enabled: usbConfig.roaming_enabled,
            apn: usbConfig.apn,
            sim_pin: usbConfig.sim_pin ? '***' : null
          })
        } else {
          logger.debug('[DeviceModal] ⚠️ Aucune configuration USB disponible - chargement depuis base ou formulaire vide')
        }
        
        // Si USB connecté OU dispositif non enregistré, utiliser les données USB (priorité USB)
        // Sinon, si c'est un dispositif en base, charger depuis la base
        const isUsbConnectedOrNotRegistered = isUsbConnected || isNotRegistered
        
        // Pour les dispositifs USB/virtuels, toujours essayer de charger la config USB même si vide
        // Cela garantit que tous les champs sont disponibles pour configuration
        if (isVirtualOrUsbConnected) {
          // Pré-remplir avec les données USB disponibles (même logique pour virtuel et base connecté)
          // Si usbConfig est null, on initialise avec des valeurs vides/null pour permettre la configuration
          const usbFormData = {
            device_name: editingItem?.device_name || defaultDeviceName,
            sim_iccid: usbDeviceInfo?.sim_iccid || editingItem?.sim_iccid || '',
            device_serial: usbDeviceInfo?.device_serial || editingItem?.device_serial || '',
            firmware_version: usbDeviceInfo?.firmware_version || editingItem?.firmware_version || '',
            status: editingItem?.status || 'inactive',
            patient_id: editingItem?.patient_id || null,
            // Configuration depuis USB si disponible (convertir ms → sec pour l'affichage)
            // Si usbConfig est null, toutes les valeurs restent null/vide pour permettre la configuration
            sleep_minutes: usbConfig?.sleep_minutes ?? null,
            measurement_duration_ms: usbConfig?.measurement_duration_ms != null 
              ? parseFloat((usbConfig.measurement_duration_ms / 1000).toFixed(1))
              : null,
            send_every_n_wakeups: usbConfig?.send_every_n_wakeups ?? null,
            calibration_coefficients: usbConfig?.calibration_coefficients && Array.isArray(usbConfig.calibration_coefficients)
              ? usbConfig.calibration_coefficients
              : null,
            gps_enabled: usbConfig?.gps_enabled ?? null,
            roaming_enabled: usbConfig?.roaming_enabled ?? null,
            // Airflow depuis USB (convertir ms → sec pour l'affichage)
            airflow_passes: usbConfig?.airflow_passes ?? null,
            airflow_samples_per_pass: usbConfig?.airflow_samples_per_pass ?? null,
            airflow_delay_ms: usbConfig?.airflow_delay_ms != null
              ? parseFloat((usbConfig.airflow_delay_ms / 1000).toFixed(3))
              : null,
            // Modem depuis USB (convertir sec → min pour watchdog, ms → sec pour les autres)
            watchdog_seconds: usbConfig?.watchdog_seconds != null
              ? parseFloat((usbConfig.watchdog_seconds / 60).toFixed(1))
              : null,
            modem_boot_timeout_ms: usbConfig?.modem_boot_timeout_ms != null
              ? parseFloat((usbConfig.modem_boot_timeout_ms / 1000).toFixed(1))
              : null,
            sim_ready_timeout_ms: usbConfig?.sim_ready_timeout_ms != null
              ? parseFloat((usbConfig.sim_ready_timeout_ms / 1000).toFixed(1))
              : null,
            network_attach_timeout_ms: usbConfig?.network_attach_timeout_ms != null
              ? parseFloat((usbConfig.network_attach_timeout_ms / 1000).toFixed(1))
              : null,
            modem_max_reboots: usbConfig?.modem_max_reboots ?? null,
            // Réseau depuis USB (priorité: operator direct > détection depuis APN > manual si APN non reconnu)
            operator: usbConfig?.operator 
              ? usbConfig.operator 
              : (usbConfig?.apn 
                ? (detectOperatorFromApn(usbConfig.apn) || 'manual')
                : (usbDeviceInfo?.operator || '')),
            apn: usbConfig?.apn || '',
            sim_pin: usbConfig?.sim_pin || '',
            // OTA depuis USB
            ota_primary_url: usbConfig?.ota_primary_url || '',
            ota_fallback_url: usbConfig?.ota_fallback_url || '',
            ota_md5: usbConfig?.ota_md5 || ''
          }
          setFormData(usbFormData)
          // Sauvegarder les valeurs initiales pour comparaison (même pour dispositif en base connecté)
          initialFormDataRef.current = JSON.parse(JSON.stringify(usbFormData))
        } else if (editingItem && editingItem.id && !isNotRegistered) {
          // Dispositif en base mais NON connecté en USB - charger depuis la base
          // Ne charger que si c'est un vrai ID de base de données (pas un ID temporaire virtuel)
          const initialFormData = {
            device_name: editingItem.device_name || '',
            sim_iccid: editingItem.sim_iccid || '',
            device_serial: editingItem.device_serial || '',
            firmware_version: editingItem.firmware_version || '',
            status: editingItem.status || 'inactive',
            patient_id: editingItem.patient_id || null,
            // Toutes les valeurs de configuration seront chargées depuis la base via loadDeviceConfig
            sleep_minutes: null,
            measurement_duration_ms: null,
            send_every_n_wakeups: null,
            calibration_coefficients: null,
            gps_enabled: null,
            roaming_enabled: null,
            airflow_passes: null,
            airflow_samples_per_pass: null,
            airflow_delay_ms: null,
            watchdog_seconds: null,
            modem_boot_timeout_ms: null,
            sim_ready_timeout_ms: null,
            network_attach_timeout_ms: null,
            modem_max_reboots: null,
            apn: '',
            operator: '',
            sim_pin: '',
            ota_primary_url: '',
            ota_fallback_url: '',
            ota_md5: ''
          }
          setFormData(initialFormData)
          initialFormDataRef.current = JSON.parse(JSON.stringify(initialFormData))
          // Ne charger la config que si c'est un vrai ID numérique (pas un ID temporaire)
          if (typeof editingItem.id === 'number' || (typeof editingItem.id === 'string' && !editingItem.id.startsWith('usb-'))) {
            loadDeviceConfig(editingItem.id)
          }
        } else {
          // Mode création sans USB - formulaire vide
          setFormData({
            device_name: defaultDeviceName,
            sim_iccid: '',
            device_serial: '',
            firmware_version: '',
            status: 'inactive',
            patient_id: null,
            sleep_minutes: null,
            measurement_duration_ms: null,
            send_every_n_wakeups: null,
            calibration_coefficients: null,
            gps_enabled: null,
            roaming_enabled: null,
            airflow_passes: null,
            airflow_samples_per_pass: null,
            airflow_delay_ms: null,
            watchdog_seconds: null,
            modem_boot_timeout_ms: null,
            sim_ready_timeout_ms: null,
            network_attach_timeout_ms: null,
            modem_max_reboots: null,
            apn: '',
            operator: '',
            sim_pin: '',
            ota_primary_url: '',
            ota_fallback_url: '',
            ota_md5: ''
          })
          // En mode création, pas de valeurs initiales (toujours considéré comme modifié)
          initialFormDataRef.current = null
        }
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

  // Mapping opérateur → APN (selon le firmware)
  const operatorApnMap = {
    'Orange': 'orange',
    'Free': 'free',
    'SFR': 'sl2sfr',
    'Bouygues': 'mmsbouygtel'
  }
  
  // Liste des clés de configuration à comparer (partagée entre hasChanges et détection des changements)
  const CONFIG_FIELDS_TO_COMPARE = [
    'device_name',
    'device_serial',
    'status',
    'sleep_minutes',
    'measurement_duration_ms',
    'send_every_n_wakeups',
    'calibration_coefficients',
    'gps_enabled',
    'roaming_enabled',
    'airflow_passes',
    'airflow_samples_per_pass',
    'airflow_delay_ms',
    'watchdog_seconds',
    'modem_boot_timeout_ms',
    'sim_ready_timeout_ms',
    'network_attach_timeout_ms',
    'modem_max_reboots',
    'apn',
    'operator',
    'sim_pin',
    'ota_primary_url',
    'ota_fallback_url',
    'ota_md5'
  ]
  
  // Noms lisibles pour les clés (partagé)
  const CONFIG_KEY_NAMES = {
    'device_name': 'Nom',
    'device_serial': 'Serial',
    'status': 'Statut',
    'gps_enabled': 'GPS',
    'roaming_enabled': 'Itinérance',
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
    'operator': 'Opérateur',
    'sim_pin': 'PIN SIM',
    'ota_primary_url': 'OTA primaire',
    'ota_fallback_url': 'OTA secours',
    'ota_md5': 'MD5 OTA'
  }

  // Détecter l'opérateur depuis l'APN
  const detectOperatorFromApn = (apn) => {
    if (!apn) return ''
    const apnLower = apn.toLowerCase()
    if (apnLower === 'orange' || apnLower === 'orange.fr') return 'Orange'
    if (apnLower === 'free' || apnLower === 'mmsfree') return 'Free'
    if (apnLower === 'sl2sfr' || apnLower === 'sfr') return 'SFR'
    if (apnLower === 'mmsbouygtel' || apnLower === 'bouygues') return 'Bouygues'
    return ''
  }

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
        // UTILISER UNIQUEMENT les valeurs de la base - PAS de valeurs par défaut
        const configData = {
          sleep_minutes: data.config.sleep_minutes ?? null,
          // Convertir ms → sec pour l'affichage (garder comme nombre pour les inputs)
          measurement_duration_ms: data.config.measurement_duration_ms != null 
            ? parseFloat((data.config.measurement_duration_ms / 1000).toFixed(1))
            : null,
          send_every_n_wakeups: data.config.send_every_n_wakeups ?? null,
          calibration_coefficients: data.config.calibration_coefficients ?? null,
          gps_enabled: data.config.gps_enabled ?? null,
          roaming_enabled: data.config.roaming_enabled ?? null,
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
          modem_max_reboots: data.config.modem_max_reboots ?? null,
          apn: data.config.apn ?? '',
          // Si un APN est présent mais pas d'opérateur, vérifier si c'est un APN connu
          // Si oui, mettre l'opérateur correspondant, sinon mettre 'manual' pour afficher le champ APN
          operator: data.config.operator 
            ? data.config.operator 
            : (data.config.apn 
              ? (detectOperatorFromApn(data.config.apn) || 'manual')
              : ''),
          sim_pin: data.config.sim_pin ?? '',
          ota_primary_url: data.config.ota_primary_url ?? '',
          ota_fallback_url: data.config.ota_fallback_url ?? '',
          ota_md5: data.config.ota_md5 ?? ''
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

    // Si l'opérateur change
    if (name === 'operator') {
      if (value === 'manual') {
        // Mode configuration manuelle : réinitialiser l'APN pour permettre la saisie manuelle
        newFormData.apn = ''
      } else if (value && operatorApnMap[value]) {
        // Opérateur sélectionné : configurer l'APN automatiquement
        newFormData.apn = operatorApnMap[value]
      } else {
        // Mode automatique : réinitialiser l'APN (sera détecté par le firmware)
        newFormData.apn = ''
      }
    }
    // Si l'APN change manuellement (seulement en mode manuel)
    else if (name === 'apn' && formData.operator === 'manual') {
      // En mode manuel, on garde l'APN tel quel
      // Pas de détection automatique de l'opérateur en mode manuel
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
  // Calculer si le dispositif est enregistré en base de données
  const isNotRegistered = useMemo(() => {
    if (!editingItem) return true
    
    // Vérifier si editingItem a un vrai ID de base de données
    const hasRealId = editingItem?.id && 
      (typeof editingItem.id === 'number' || 
       (typeof editingItem.id === 'string' && !editingItem.id.startsWith('usb-')))
    
    return !hasRealId || editingItem?.isVirtual || editingItem?.isTemporary
  }, [editingItem])

  const isDeviceUsbConnected = useMemo(() => {
    if (!editingItem || !usbIsConnected || !port) return false
    const currentUsbDevice = usbDevice
    if (!currentUsbDevice) return false
    
    // Helper: Vérifier si un dispositif est non enregistré
    const checkIsNotRegistered = (device) => {
      if (!device) return true
      if (!device.id) return true
      if (typeof device.id === 'string' && device.id.startsWith('usb-')) return true
      if (device.isVirtual || device.isTemporary) return true
      return false
    }
    
    // Si le dispositif n'est pas enregistré (pas d'ID réel), considérer qu'il est connecté si USB est connecté
    if (checkIsNotRegistered(editingItem)) {
      return true
    }
    
    // Vérifier si l'ICCID ou le serial correspond
    return (
      (editingItem.sim_iccid && currentUsbDevice.sim_iccid === editingItem.sim_iccid) ||
      (editingItem.device_serial && currentUsbDevice.device_serial === editingItem.device_serial)
    )
  }, [editingItem, usbIsConnected, port, usbDevice])
  
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
          roaming_enabled: configPayload.roaming_enabled,
          airflowPasses: configPayload.airflow_passes,
          airflowSamples: configPayload.airflow_samples_per_pass,
          airflowDelay: configPayload.airflow_delay_ms,
          watchdogSeconds: configPayload.watchdog_seconds,
          modemBootTimeout: configPayload.modem_boot_timeout_ms,
          simReadyTimeout: configPayload.sim_ready_timeout_ms,
          networkAttachTimeout: configPayload.network_attach_timeout_ms,
          modemReboots: configPayload.modem_max_reboots,
          apn: configPayload.apn,
          operator: configPayload.operator,
          simPin: configPayload.sim_pin,
          otaPrimaryUrl: configPayload.ota_primary_url,
          otaFallbackUrl: configPayload.ota_fallback_url,
          otaMd5: configPayload.ota_md5
        }
        const payload = buildUpdateConfigPayload(mappedConfig)
        
        // Log détaillé du payload complet pour debug
        logger.log(`[USB] Payload UPDATE_CONFIG complet:`, JSON.stringify(payload, null, 2))
        
        // Log de debug pour vérifier l'opérateur envoyé
        if (payload.operator) {
          logger.log(`[USB] Opérateur à envoyer: "${payload.operator}" (configPayload.operator: "${configPayload.operator}", mappedConfig.operator: "${mappedConfig.operator}")`)
        } else {
          logger.log(`[USB] Aucun opérateur dans le payload (configPayload.operator: "${configPayload.operator}", mappedConfig.operator: "${mappedConfig.operator}")`)
        }
        
        const command = JSON.stringify({
          command: 'UPDATE_CONFIG',
          payload: payload
        })
        const commandWithNewline = command + '\n'
        
        if (appendLog) {
          appendLog(`📤 [USB] Envoi configuration directement via USB...`, 'dashboard')
          appendLog(`🔍 [DEBUG] Commande complète: ${command}`, 'dashboard')
          if (payload.operator) {
            appendLog(`🔍 [DEBUG] Opérateur dans payload: "${payload.operator}"`, 'dashboard')
          }
        }
        
        await usbWrite(commandWithNewline)
        
        if (appendLog) {
          appendLog(`✅ [USB] Configuration envoyée via USB avec succès`, 'dashboard')
          appendLog(`✅ [USB] Confirmation: Configuration reçue et appliquée par le dispositif`, 'dashboard')
        }
        
        logger.log('✅ Configuration envoyée au dispositif via USB avec succès')
        
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
          appendLog(`✅ [OTA] Confirmation: Configuration enregistrée, sera appliquée à la prochaine connexion OTA`, 'dashboard')
        }
        
        logger.log('✅ Configuration envoyée au dispositif via OTA avec succès')
        
        return { success: true, method: 'OTA' }
      } catch (err) {
        logger.error('Erreur envoi config OTA:', err)
        // Si l'erreur indique que le dispositif n'existe pas, ne pas bloquer
        // (peut arriver si le dispositif est en cours de création)
        if (err.message?.includes('not found') || err.message?.includes('n\'existe pas') || err.message?.includes('does not exist')) {
          logger.warn('⚠️ Dispositif non trouvé en base, configuration sera envoyée lors de la prochaine connexion OTA')
          // Retourner un succès partiel pour ne pas bloquer le processus
          return { success: true, method: 'OTA', pending: true }
        }
        throw err
      }
    }
  }
  
  // Fonction helper pour normaliser les valeurs avant comparaison
  // Normalise uniquement les différences non significatives (null/undefined/'')
  // Gère spécialement l'auto-remplissage du navigateur pour sim_pin et apn
  const normalizeValue = (value, key = null) => {
    // Traiter null, undefined, et '' comme équivalents (uniquement pour les valeurs vides)
    if (value === null || value === undefined || value === '') {
      return null
    }
    // Pour les booléens, retourner tel quel
    if (typeof value === 'boolean') {
      return value
    }
    // Pour les nombres, retourner tel quel (même NaN et Infinity)
    if (typeof value === 'number') {
      return value
    }
    // Pour les tableaux, normaliser chaque élément
    if (Array.isArray(value)) {
      return value.map(v => normalizeValue(v, key))
    }
    // Pour les objets, normaliser récursivement
    if (typeof value === 'object' && value !== null) {
      const normalized = {}
      for (const objKey in value) {
        if (value.hasOwnProperty(objKey)) {
          normalized[objKey] = normalizeValue(value[objKey], objKey)
        }
      }
      return normalized
    }
    // Pour les strings, trim et retourner (sauf si vide après trim)
    // Pour sim_pin et apn, normalisation plus stricte pour ignorer l'auto-remplissage
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed === '') {
        return null
      }
      // Pour sim_pin et apn, s'assurer que les espaces en début/fin sont bien supprimés
      // et que la comparaison est case-insensitive pour apn (mais pas pour sim_pin qui est sensible)
      if (key === 'apn') {
        return trimmed.toLowerCase()
      }
      // Pour sim_pin, garder la casse mais s'assurer qu'il n'y a pas d'espaces
      return trimmed
    }
    // Sinon, retourner la valeur telle quelle
    return value
  }
  
  // Fonction helper pour comparer deux valeurs normalisées
  const areValuesEqual = (val1, val2) => {
    // Si les deux sont null (après normalisation), ils sont égaux
    if (val1 === null && val2 === null) {
      return true
    }
    // Si l'un est null et l'autre non, ils sont différents
    if (val1 === null || val2 === null) {
      return false
    }
    // Pour les tableaux, comparer élément par élément
    if (Array.isArray(val1) || Array.isArray(val2)) {
      if (!Array.isArray(val1) || !Array.isArray(val2)) {
        return false
      }
      if (val1.length !== val2.length) {
        return false
      }
      for (let i = 0; i < val1.length; i++) {
        if (!areValuesEqual(val1[i], val2[i])) {
          return false
        }
      }
      return true
    }
    // Pour les nombres, utiliser une comparaison stricte (gérer NaN)
    if (typeof val1 === 'number' && typeof val2 === 'number') {
      if (isNaN(val1) && isNaN(val2)) {
        return true
      }
      return val1 === val2
    }
    // Pour les autres types, comparaison stricte
    return val1 === val2
  }
  
  // Détecter si des modifications ont été faites (uniquement en mode édition)
  const hasChanges = useMemo(() => {
    if (!editingItem || !initialFormDataRef.current) {
      // En mode création, toujours considéré comme modifié
      return true
    }
    
    // Comparer champ par champ pour éviter les faux positifs
    let hasAnyChange = false
    for (const key of CONFIG_FIELDS_TO_COMPARE) {
      // Passer la clé à normalizeValue pour une normalisation spécifique (apn en lowercase, etc.)
      const currentVal = normalizeValue(formData[key], key)
      const initialVal = normalizeValue(initialFormDataRef.current[key], key)
      
      // Utiliser la fonction de comparaison robuste
      if (!areValuesEqual(currentVal, initialVal)) {
        hasAnyChange = true
        break // Sortir dès qu'on trouve une différence
      }
    }
    
    // Mémoriser le résultat pour éviter les changements dus aux re-renders
    // Ne mettre à jour que si le résultat change vraiment
    if (lastHasChangesRef.current !== hasAnyChange) {
      lastHasChangesRef.current = hasAnyChange
    }
    return hasAnyChange
  }, [
    // Utiliser uniquement les valeurs pertinentes pour éviter les re-calculs inutiles
    formData.device_name,
    formData.device_serial,
    formData.status,
    formData.sleep_minutes,
    formData.measurement_duration_ms,
    formData.send_every_n_wakeups,
    formData.calibration_coefficients,
    formData.gps_enabled,
    formData.roaming_enabled,
    formData.airflow_passes,
    formData.airflow_samples_per_pass,
    formData.airflow_delay_ms,
    formData.watchdog_seconds,
    formData.modem_boot_timeout_ms,
    formData.sim_ready_timeout_ms,
    formData.network_attach_timeout_ms,
    formData.modem_max_reboots,
    formData.apn,
    formData.operator,
    formData.sim_pin,
    formData.ota_primary_url,
    formData.ota_fallback_url,
    formData.ota_md5,
    editingItem
  ])

  const validateForm = () => {
    const errors = {}
    
    // Si le dispositif est un dispositif non enregistré USB sans nom, utiliser un nom par défaut
    const isDeviceNotRegistered = !editingItem?.id || 
      (editingItem?.id && typeof editingItem.id === 'string' && editingItem.id.startsWith('usb-')) ||
      editingItem?.isVirtual || 
      editingItem?.isTemporary
    const deviceName = formData.device_name?.trim() || (isDeviceNotRegistered ? 'USB-Device' : '')
    
    if (!deviceName || deviceName.length === 0) {
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

    // Validation SIM PIN (4-8 chiffres, standard SIM)
    if (formData.sim_pin && formData.sim_pin.trim().length > 0) {
      const simPin = formData.sim_pin.trim()
      if (simPin.length < 4 || simPin.length > 8) {
        errors.sim_pin = 'Le code PIN SIM doit contenir entre 4 et 8 chiffres'
      } else if (!/^\d+$/.test(simPin)) {
        errors.sim_pin = 'Le code PIN SIM doit contenir uniquement des chiffres'
      }
    }

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Réinitialiser la configuration aux valeurs par défaut
  const handleResetConfig = async () => {
    if (!editingItem || !isDeviceUsbConnected || !usbWrite || !port) {
      return
    }

    if (!confirm('⚠️ Êtes-vous sûr de vouloir réinitialiser tous les paramètres aux valeurs par défaut ?\n\nCette action va réinitialiser :\n• APN\n• Code PIN SIM\n• Sleep\n• GPS\n• Roaming\n• Calibration\n\n(Serial et ICCID seront conservés)')) {
      return
    }

    setSaving(true)
    setFormError(null)

    try {
      const command = JSON.stringify({
        command: 'RESET_CONFIG'
        // Pas de payload pour RESET_CONFIG
      })
      const commandWithNewline = command + '\n'

      if (appendLog) {
        appendLog('🔄 [USB] Envoi commande RESET_CONFIG...', 'dashboard')
      }

      await usbWrite(commandWithNewline)

      if (appendLog) {
        appendLog('✅ [USB] Commande RESET_CONFIG envoyée avec succès', 'dashboard')
        appendLog('⏳ Attente de la réponse du dispositif...', 'dashboard')
      }

      // Attendre un peu pour laisser le temps au dispositif de traiter
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Recharger la configuration depuis le dispositif si possible
      if (editingItem?.id) {
        // Forcer un rechargement de la configuration
        if (onClose) {
          // Fermer et rouvrir le modal pour recharger les données
          onClose()
          // Note: Le parent devra rouvrir le modal manuellement
        }
      }

      setSuccess('Configuration réinitialisée aux valeurs par défaut avec succès')
    } catch (err) {
      const errorMessage = err?.message || 'Erreur lors de la réinitialisation'
      setFormError(errorMessage)
      if (appendLog) {
        appendLog(`❌ [USB] Erreur: ${errorMessage}`, 'error')
      }
      logger.error('Erreur reset config:', err)
    } finally {
      setSaving(false)
    }
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
      // Utiliser un nom par défaut si le dispositif est virtuel USB sans nom
      const isDeviceNotRegistered = !editingItem?.id || 
        (editingItem?.id && typeof editingItem.id === 'string' && editingItem.id.startsWith('usb-')) ||
        editingItem?.isVirtual || 
        editingItem?.isTemporary
      const deviceName = formData.device_name?.trim() || (isDeviceNotRegistered ? 'USB-Device' : '')
      const devicePayload = {
        device_name: deviceName,
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
      if (formData.roaming_enabled != null) {
        configPayload.roaming_enabled = formData.roaming_enabled
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
      // Ne pas envoyer 'manual' comme opérateur, seulement les vrais opérateurs
      if (formData.operator && formData.operator.trim() && formData.operator !== 'manual') {
        configPayload.operator = formData.operator.trim()
        // Si un opérateur est sélectionné, envoyer aussi l'APN correspondant
        if (operatorApnMap[formData.operator]) {
          configPayload.apn = operatorApnMap[formData.operator]
        }
      }
      // En mode manuel, envoyer uniquement l'APN (pas d'opérateur)
      if (formData.operator === 'manual' && formData.apn && formData.apn.trim()) {
        configPayload.apn = formData.apn.trim()
      }
      // Si pas d'opérateur et pas de mode manuel, mais qu'un APN est présent (cas rare)
      else if (!formData.operator && formData.apn && formData.apn.trim()) {
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
      // MD5 est calculé automatiquement lors de l'upload du firmware, pas besoin de le saisir manuellement
      // if (formData.ota_md5 && formData.ota_md5.trim()) {
      //   configPayload.ota_md5 = formData.ota_md5.trim()
      // }

      // Vérifier si c'est un dispositif enregistré (a un vrai ID de base de données)
      // Un vrai ID est un nombre ou une string qui ne commence pas par 'usb-'
      const hasRealId = editingItem?.id && 
        (typeof editingItem.id === 'number' || 
         (typeof editingItem.id === 'string' && !editingItem.id.startsWith('usb-')))
      const isNotRegistered = !hasRealId || editingItem?.isVirtual || editingItem?.isTemporary
      
      if (editingItem && hasRealId && !isNotRegistered) {
        // Modification - dispositif enregistré en base avec un vrai ID
        const endpoint = `/api.php/devices/${editingItem.id}`

        // Mettre à jour le dispositif
        await fetchJson(
          fetchWithAuth,
          API_URL,
          endpoint,
          { method: 'PUT', body: JSON.stringify(devicePayload) },
          { requiresAuth: true }
        )

        // Mettre à jour la configuration si fournie (uniquement pour dispositifs enregistrés)
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
              if (key === 'operator') return val || '(automatique)'
              if (key === 'sim_pin') return '***'
              if (key === 'ota_primary_url') return val.length > 30 ? val.substring(0, 30) + '...' : val
              if (key === 'ota_fallback_url') return val.length > 30 ? val.substring(0, 30) + '...' : val
              return String(val)
            }
            
            // Détecter les changements dans TOUS les champs de configuration en utilisant la même logique robuste
            // Filtrer uniquement les champs de configuration (exclure device_name, device_serial, status qui sont gérés séparément)
            const configFieldsOnly = CONFIG_FIELDS_TO_COMPARE.filter(key => 
              !['device_name', 'device_serial', 'status'].includes(key)
            )
            
            configFieldsOnly.forEach((key) => {
              // Récupérer les valeurs depuis formData et initialData (utiliser les valeurs d'affichage, pas les valeurs converties)
              // Passer la clé pour une normalisation spécifique (apn en lowercase, etc.)
              const currentVal = normalizeValue(formData[key], key)
              const initialVal = normalizeValue(initialData[key], key)
              
              // Utiliser la fonction de comparaison robuste
              if (!areValuesEqual(currentVal, initialVal)) {
                // Utiliser les valeurs originales pour l'affichage
                const oldDisplay = initialData[key]
                const oldFormatted = oldDisplay !== null && oldDisplay !== undefined && oldDisplay !== '' 
                  ? formatValue(key, oldDisplay) 
                  : '(vide)'
                const newDisplay = formData[key]
                const newFormatted = newDisplay !== null && newDisplay !== undefined && newDisplay !== '' 
                  ? formatValue(key, newDisplay) 
                  : '(vide)'
                
                changes.push(`${CONFIG_KEY_NAMES[key] || key}: ${oldFormatted} → ${newFormatted}`)
              }
            })
            
            // Détecter les changements dans les données du dispositif (device_name, device_serial, status)
            // Utiliser la même logique de comparaison robuste
            const deviceFields = ['device_name', 'device_serial', 'status']
            deviceFields.forEach((key) => {
              // Passer la clé pour une normalisation spécifique
              const currentVal = normalizeValue(key === 'device_name' ? devicePayload.device_name : formData[key], key)
              const initialVal = normalizeValue(initialData[key], key)
              
              if (!areValuesEqual(currentVal, initialVal)) {
                const oldDisplay = initialData[key] || '(vide)'
                const newDisplay = key === 'device_name' ? devicePayload.device_name : (formData[key] || '(vide)')
                changes.push(`${CONFIG_KEY_NAMES[key] || key}: "${oldDisplay}" → "${newDisplay}"`)
              }
            })
            
            // Afficher un log bleu dans le terminal pour confirmer
            if (appendLog) {
              // Ne pas afficher l'APN si il correspond automatiquement à l'opérateur sélectionné
              const operatorApnMap = {
                'Orange': 'orange',
                'Free': 'free',
                'SFR': 'sl2sfr',
                'Bouygues': 'mmsbouygtel'
              }
              
              const configSummary = Object.entries(configPayload)
                .filter(([key, val]) => {
                  // Filtrer l'APN si il correspond à l'opérateur sélectionné (éviter la redondance)
                  if (key === 'apn' && configPayload.operator && operatorApnMap[configPayload.operator]) {
                    return val?.toLowerCase() !== operatorApnMap[configPayload.operator].toLowerCase()
                  }
                  return true
                })
                .map(([key, val]) => {
                  if (key === 'gps_enabled') return `GPS: ${val ? 'ON' : 'OFF'}`
                  if (key === 'roaming_enabled') return `Roaming: ${val ? 'ON' : 'OFF'}`
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
                  if (key === 'operator') return `Opérateur: ${val || '(automatique)'}`
                  if (key === 'sim_pin') return `PIN: ***`
                  if (key === 'ota_primary_url') return `OTA1: ${val.substring(0, 30)}...`
                  if (key === 'ota_fallback_url') return `OTA2: ${val.substring(0, 30)}...`
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
            // Mais ne pas créer de commande UPDATE_CONFIG car elle a déjà été envoyée via USB
            if (result.method === 'USB') {
              try {
                await fetchJson(
                  fetchWithAuth,
                  API_URL,
                  `/api.php/devices/${editingItem.id}/config`,
                  {
                    method: 'PUT',
                    body: JSON.stringify({ ...configPayload, via_usb: true })
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
        // Utiliser la même logique de comparaison robuste
        const changes = []
        const initialData = initialFormDataRef.current || {}
        
        const deviceFields = ['device_name', 'device_serial', 'status']
        deviceFields.forEach((key) => {
          const currentVal = normalizeValue(key === 'device_name' ? devicePayload.device_name : formData[key])
          const initialVal = normalizeValue(initialData[key])
          
          if (!areValuesEqual(currentVal, initialVal)) {
            const oldDisplay = initialData[key] || '(vide)'
            const newDisplay = key === 'device_name' ? devicePayload.device_name : (formData[key] || '(vide)')
            changes.push(`${CONFIG_KEY_NAMES[key] || key}: "${oldDisplay}" → "${newDisplay}"`)
          }
        })
        
        if (changes.length > 0) {
          const changesText = changes.join(', ')
          logger.log(`✅ Dispositif "${devicePayload.device_name}" modifié: ${changesText}`)
        } else {
          logger.log(`✅ Dispositif "${devicePayload.device_name}" modifié (aucun changement détecté)`)
        }
      } else {
        // Création OU dispositif virtuel - vérifier d'abord si le dispositif existe déjà
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

          // Détecter les changements en utilisant la même logique robuste
          const changes = []
          const initialData = initialFormDataRef.current || {}
          
          const deviceFields = ['device_name', 'device_serial', 'status']
          deviceFields.forEach((key) => {
            // Passer la clé pour une normalisation spécifique
            const currentVal = normalizeValue(key === 'device_name' ? devicePayload.device_name : formData[key], key)
            const initialVal = normalizeValue(initialData[key], key)
            
            if (!areValuesEqual(currentVal, initialVal)) {
              const oldDisplay = initialData[key] || '(vide)'
              const newDisplay = key === 'device_name' ? devicePayload.device_name : (formData[key] || '(vide)')
              changes.push(`${CONFIG_KEY_NAMES[key] || key}: "${oldDisplay}" → "${newDisplay}"`)
            }
          })
          
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
                (data.device.sim_iccid && usbDevice?.sim_iccid === data.device.sim_iccid) ||
                (data.device.device_serial && usbDevice?.device_serial === data.device.device_serial)
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
                
                // Sauvegarder en base mais ne pas créer de commande UPDATE_CONFIG
                // car elle a déjà été envoyée via USB
                await fetchJson(
                  fetchWithAuth,
                  API_URL,
                  `/api.php/devices/${data.device.id}/config`,
                  {
                    method: 'PUT',
                    body: JSON.stringify({ ...configPayload, via_usb: true })
                  },
                  { requiresAuth: true }
                )
              } else {
                // Pas de connexion USB, sauvegarder en base (créera une commande UPDATE_CONFIG pour OTA)
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
              }
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

        <form onSubmit={handleSubmit} autoComplete="off" className="p-4 sm:p-6 space-y-3">
          {formError && <ErrorMessage message={formError} />}

          {/* Première ligne : Nom et Statut */}
          <div className={`grid gap-3 ${editingItem?.id && !isNotRegistered ? 'grid-cols-2' : 'grid-cols-1'}`}>
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
                autoComplete="off"
                className={`input w-full ${formErrors.device_name ? 'border-red-500' : ''}`}
                placeholder="Ex: Dispositif OTT-001"
                required
              />
              {formErrors.device_name && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.device_name}</p>
              )}
            </div>

            {/* Statut - Affiché pour tous les dispositifs enregistrés en base (même s'ils sont connectés en USB) */}
            {editingItem?.id && !isNotRegistered && (
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                  Statut
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleInputChange}
                  autoComplete="off"
                  className="input w-full"
                >
                  <option value="inactive">⏸️ Inactif</option>
                  <option value="active">✅ Actif</option>
                </select>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Statut du dispositif enregistré (actif = reçoit les commandes OTA)
                </p>
              </div>
            )}
            {/* Message pour dispositif USB virtuel (non enregistré) */}
            {(!editingItem?.id || isNotRegistered) && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  🔌 <strong>Dispositif connecté en USB</strong>
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  {isNotRegistered 
                    ? "Ce dispositif n'est pas encore enregistré en base. Il sera ajouté automatiquement lors de la première connexion OTA."
                    : "Dispositif connecté en USB - les données sont chargées en temps réel depuis le dispositif."}
                </p>
              </div>
            )}
          </div>

          {/* Numéro de série */}
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
              Numéro de série {editingItem?.id && <span className="text-xs text-gray-500">(non modifiable)</span>}
            </label>
            <input
              type="text"
              name="device_serial"
              value={formData.device_serial ?? ''}
              onChange={handleInputChange}
              autoComplete="off"
              disabled={!!editingItem?.id}
              className={`input w-full ${formErrors.device_serial ? 'border-red-500' : ''} ${editingItem?.id ? 'bg-gray-100 dark:bg-gray-800 cursor-not-allowed' : ''}`}
              placeholder="Auto-généré (OTT-001, OTT-002, etc.)"
              title={editingItem?.id ? 'Le numéro de série ne peut pas être modifié (traçabilité médicale)' : 'Sera généré automatiquement'}
            />
            {formErrors.device_serial && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formErrors.device_serial}</p>
            )}
          </div>


          {/* Configuration - Onglets par niveau */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-4">
            <div className="mb-4">
              <div className="flex space-x-2 border-b border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setConfigTab('basic')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    configTab === 'basic'
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  📊 Basique
                </button>
                <button
                  type="button"
                  onClick={() => setConfigTab('advanced')}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    configTab === 'advanced'
                      ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
                >
                  ⚙️ Avancé
                </button>
              </div>
            </div>

            {/* Onglet Basique */}
            {configTab === 'basic' && (
              <div className="space-y-2">
                <Accordion title="📊 Mesure" defaultOpen={true}>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Tooltip content="Durée de veille entre chaque réveil du dispositif.\n\nLe dispositif se met en veille profonde pour économiser la batterie, puis se réveille après ce délai pour prendre une mesure et envoyer les données.">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        ⏰ Veille (min)
                      </label>
                    </Tooltip>
                    <input
                      type="number"
                      name="sleep_minutes"
                      value={formData.sleep_minutes || ''}
                      onChange={handleInputChange}
                      autoComplete="off"
                      className="input w-full text-sm py-1.5"
                      placeholder="1440 (24h)"
                      min="1"
                      title="Durée en minutes entre chaque réveil. Exemple: 1440 = 24 heures, 60 = 1 heure"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Par défaut: 1440 min (24h) - Intervalle entre envois OTA
                    </p>
                  </div>
                  <div>
                    <Tooltip content="Durée de la mesure de débit d'air en secondes.\n\nLe capteur prend plusieurs échantillons pendant cette durée pour calculer une valeur moyenne précise.">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        ⏱️ Durée (sec)
                      </label>
                    </Tooltip>
                    <input
                      type="number"
                      step="0.1"
                      name="measurement_duration_ms"
                      value={formData.measurement_duration_ms ?? ''}
                      onChange={handleInputChangeWithConversion}
                      autoComplete="off"
                      className="input w-full text-sm py-1.5"
                      placeholder="5.0"
                      min="0.1"
                      title="Durée de la mesure en secondes. Plus long = plus précis mais consomme plus de batterie. Recommandé: 3-10 secondes"
                    />
                  </div>
                  <div>
                    <Tooltip content="Fréquence d'envoi des données au serveur.\n\n• 1 = envoi à chaque réveil\n• 2 = envoi tous les 2 réveils\n• etc.\n\nUtile pour économiser les données réseau.">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        📤 Envoi (N réveils)
                      </label>
                    </Tooltip>
                    <input
                      type="number"
                      name="send_every_n_wakeups"
                      value={formData.send_every_n_wakeups ?? ''}
                      onChange={handleInputChange}
                      autoComplete="off"
                      className="input w-full text-sm py-1.5"
                      min="1"
                      placeholder="1"
                      title="Nombre de réveils entre chaque envoi. 1 = toujours envoyer, 2 = envoyer tous les 2 réveils"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <div className="col-span-3">
                    <Tooltip content="Coefficients de calibration pour convertir les valeurs brutes du capteur en débit réel (L/min).\n\nFormule: débit = a2 × valeur² + a1 × valeur + a0\n\nCes valeurs sont déterminées lors de l'étalonnage du dispositif.\nModifier uniquement si vous avez effectué un étalonnage.">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        📐 Calibration (a0, a1, a2)
                      </label>
                    </Tooltip>
                    <div className="grid grid-cols-3 gap-2">
                      {[0, 1, 2].map(index => (
                        <input
                          key={index}
                          type="number"
                          step="any"
                          value={formData.calibration_coefficients?.[index] ?? ''}
                          onChange={(e) => handleCalibrationChange(index, e.target.value)}
                          autoComplete="off"
                          className="input w-full text-sm py-1.5"
                          placeholder={`a${index}`}
                          title={`Coefficient a${index} de la formule de calibration. Modifier uniquement si vous avez effectué un étalonnage.`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end">
                    <div className="w-full">
                      <Tooltip content="Active la localisation GPS du dispositif.\n\nPermet d'enregistrer la position géographique avec chaque mesure.\n\n⚠️ Consomme plus de batterie\n⚠️ Peut ralentir le démarrage du modem">
                        <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                          📍 GPS
                        </label>
                      </Tooltip>
                      <label className="relative inline-flex items-center cursor-pointer w-full justify-center" title="Activer/désactiver le GPS">
                        <input
                          type="checkbox"
                          name="gps_enabled"
                          checked={formData.gps_enabled === true}
                          onChange={(e) => setFormData(prev => ({ ...prev, gps_enabled: e.target.checked }))}
                          autoComplete="off"
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </Accordion>
              </div>
            )}

            {/* Onglet Avancé */}
            {configTab === 'advanced' && (
              <div className="space-y-2">
                {/* Airflow - Accordéon fermé */}
                <Accordion title="💨 Airflow" defaultOpen={true}>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Tooltip content="Nombre de fois que la mesure de débit est répétée.\n\nChaque passe prend plusieurs échantillons.\n\nPlus de passes = mesure plus précise mais plus longue.\n\nRecommandé: 2-5 passes">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Passes
                      </label>
                    </Tooltip>
                  <input
                    type="number"
                    name="airflow_passes"
                    value={formData.airflow_passes ?? ''}
                    onChange={handleInputChange}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="2"
                    min="1"
                    title="Nombre de passes de mesure. Recommandé: 2-5 passes"
                  />
                </div>
                <div>
                  <Tooltip content="Nombre de mesures prises pendant chaque passe.\n\nPlus d'échantillons = valeur moyenne plus précise mais mesure plus longue.\n\nRecommandé: 5-20 échantillons">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Échantillons/passe
                      </label>
                    </Tooltip>
                  <input
                    type="number"
                    name="airflow_samples_per_pass"
                    value={formData.airflow_samples_per_pass || ''}
                    onChange={handleInputChange}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="10"
                    min="1"
                    title="Nombre d'échantillons par passe. Recommandé: 5-20 échantillons"
                  />
                </div>
                <div>
                  <Tooltip content="Temps d'attente entre chaque échantillon de mesure en secondes.\n\nPermet au capteur de se stabiliser entre les mesures.\n\nRecommandé: 0.005-0.01 secondes">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Délai (sec)
                      </label>
                    </Tooltip>
                  <input
                    type="number"
                    step="0.1"
                    name="airflow_delay_ms"
                    value={formData.airflow_delay_ms ?? ''}
                    onChange={handleInputChangeWithConversion}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="0.005"
                    min="0.001"
                    title="Délai en secondes entre échantillons. Recommandé: 0.005-0.01 secondes"
                  />
                </div>
              </div>
            </Accordion>

            {/* Modem - Accordéon */}
            <Accordion title="📡 Modem" defaultOpen={false}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Tooltip content="Timeout du watchdog en minutes.\n\nSi le système ne répond pas pendant ce délai, le dispositif redémarre automatiquement pour éviter les blocages.\n\nRecommandé: 3-10 minutes">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Watchdog (min)
                      </label>
                    </Tooltip>
                  <input
                    type="number"
                    step="0.1"
                    name="watchdog_seconds"
                    value={formData.watchdog_seconds || ''}
                    onChange={handleInputChangeWithConversion}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="5.0"
                    min="0.1"
                    title="Timeout en minutes avant redémarrage automatique. Recommandé: 3-10 minutes"
                  />
                </div>
                <div>
                  <Tooltip content="Temps maximum en secondes pour que le modem démarre.\n\nSi le modem ne démarre pas dans ce délai, le système considère qu'il y a un problème.\n\nRecommandé: 20-60 secondes">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Boot timeout (sec)
                      </label>
                    </Tooltip>
                  <input
                    type="number"
                    step="0.1"
                    name="modem_boot_timeout_ms"
                    value={formData.modem_boot_timeout_ms ?? ''}
                    onChange={handleInputChangeWithConversion}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="30.0"
                    min="0.1"
                    title="Temps max en secondes pour démarrer le modem. Recommandé: 20-60 secondes"
                  />
                </div>
                <div>
                  <Tooltip content="Temps maximum en secondes pour que la carte SIM soit prête.\n\nLa SIM doit être déverrouillée et initialisée avant de pouvoir utiliser le réseau.\n\nRecommandé: 5-15 secondes">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        SIM ready timeout (sec)
                      </label>
                    </Tooltip>
                  <input
                    type="number"
                    step="0.1"
                    name="sim_ready_timeout_ms"
                    value={formData.sim_ready_timeout_ms ?? ''}
                    onChange={handleInputChangeWithConversion}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="10.0"
                    min="0.1"
                    title="Temps max en secondes pour que la SIM soit prête. Recommandé: 5-15 secondes"
                  />
                </div>
                <div>
                  <Tooltip content="Temps maximum en secondes pour s'attacher au réseau mobile (4G/LTE).\n\nLe dispositif doit se connecter au réseau de l'opérateur avant de pouvoir envoyer des données.\n\nRecommandé: 30-120 secondes">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Network attach timeout (sec)
                      </label>
                    </Tooltip>
                  <input
                    type="number"
                    step="0.1"
                    name="network_attach_timeout_ms"
                    value={formData.network_attach_timeout_ms || ''}
                    onChange={handleInputChangeWithConversion}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="60.0"
                    min="0.1"
                    title="Temps max en secondes pour s'attacher au réseau. Recommandé: 30-120 secondes"
                  />
                </div>
                <div>
                  <Tooltip content="Nombre maximum de redémarrages automatiques du modem en cas d'erreur.\n\nSi le modem échoue plusieurs fois, le système arrête de réessayer pour éviter une boucle infinie.\n\nRecommandé: 2-5 redémarrages">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Max reboots
                      </label>
                    </Tooltip>
                  <input
                    type="number"
                    name="modem_max_reboots"
                    value={formData.modem_max_reboots ?? ''}
                    onChange={handleInputChange}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="3"
                    min="0"
                    title="Nombre max de redémarrages du modem. Recommandé: 2-5 redémarrages"
                  />
                </div>
              </div>
            </Accordion>

            {/* Réseau - Accordéon */}
            <Accordion title="📡 Réseau" defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <Tooltip content="Sélectionnez l'opérateur mobile ou configurez manuellement l'APN.\n\n• Automatique : Le firmware détecte automatiquement l'opérateur depuis la SIM\n• Orange, Free, SFR, Bouygues : Configuration automatique de l'APN\n• Configuration manuelle : Saisissez un APN personnalisé">
                    <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                      Opérateur mobile / APN
                    </label>
                  </Tooltip>
                  <select
                    name="operator"
                    value={formData.operator || ''}
                    onChange={handleInputChange}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    title="Sélectionnez l'opérateur ou configurez manuellement l'APN"
                  >
                    <option value="">🔍 Automatique (détection SIM)</option>
                    <option value="Orange">Orange</option>
                    <option value="Free">Free</option>
                    <option value="SFR">SFR</option>
                    <option value="Bouygues">Bouygues</option>
                    <option value="manual">⚙️ Configuration manuelle</option>
                  </select>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {formData.operator === 'manual' 
                      ? 'Saisissez l\'APN manuellement ci-dessous'
                      : formData.operator 
                        ? `APN configuré automatiquement: ${operatorApnMap[formData.operator] || 'N/A'}`
                        : 'L\'opérateur sera détecté automatiquement depuis la SIM'}
                  </p>
                </div>

                {/* Champ APN - Affiché seulement en mode manuel ou si un APN personnalisé existe */}
                {(formData.operator === 'manual' || (formData.operator && !operatorApnMap[formData.operator])) && (
                  <div>
                    <Tooltip content="Point d'accès réseau (APN) pour la connexion mobile.\n\nEn mode automatique ou avec opérateur sélectionné, l'APN est configuré automatiquement.\n\nEn mode manuel, saisissez l'APN fourni par votre opérateur.\n\nExemples:\n• orange (Orange)\n• free (Free)\n• sl2sfr (SFR)\n• mmsbouygtel (Bouygues)">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        APN (Point d'accès)
                      </label>
                    </Tooltip>
                    <input
                      type="text"
                      name="apn"
                      value={formData.apn ?? ''}
                      onChange={handleInputChange}
                      autoComplete="off"
                      className="input w-full text-sm py-1.5"
                      placeholder="Ex: orange, free, sl2sfr..."
                      title="APN pour la connexion mobile. Saisissez uniquement en mode manuel."
                    />
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Tooltip content="Active l'itinérance (roaming) pour permettre la connexion sur les réseaux d'autres opérateurs.\n\nUtile si le dispositif peut se déplacer dans des zones où l'opérateur principal n'a pas de couverture.\n\n⚠️ Peut entraîner des coûts supplémentaires selon votre forfait">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Itinérance (Roaming)
                      </label>
                    </Tooltip>
                    <label className="relative inline-flex items-center cursor-pointer w-full justify-center" title="Activer/désactiver l'itinérance">
                      <input
                        type="checkbox"
                        name="roaming_enabled"
                        checked={formData.roaming_enabled === true}
                        onChange={(e) => setFormData(prev => ({ ...prev, roaming_enabled: e.target.checked }))}
                        autoComplete="off"
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                    </label>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
                      {formData.roaming_enabled === true ? '✅ Activée' : formData.roaming_enabled === false ? '❌ Désactivée' : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <Tooltip content="Code PIN de la carte SIM pour la déverrouiller.\n\nLe code PIN est demandé au démarrage du modem si la SIM est verrouillée.\n\n⚠️ Ne pas confondre avec le code PUK (utilisé pour déverrouiller après 3 erreurs de PIN)">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        Code PIN SIM
                      </label>
                    </Tooltip>
                    <input
                      type="text"
                      name="sim_pin"
                      value={formData.sim_pin ?? ''}
                      onChange={handleInputChange}
                      autoComplete="off"
                      className="input w-full text-sm py-1.5 font-mono"
                      placeholder="0000"
                      maxLength="8"
                      title="Code PIN de la carte SIM (généralement 4 chiffres, parfois 8)"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Code PIN pour déverrouiller la SIM (généralement 4 chiffres)
                    </p>
                  </div>
                </div>
              </div>
            </Accordion>

            {/* OTA - Accordéon fermé */}
            <Accordion title="🔄 OTA" defaultOpen={false}>
              <div className="space-y-3">
                <div>
                  <Tooltip content="URL principale pour télécharger les mises à jour du firmware (OTA - Over The Air).\n\nLe dispositif télécharge le nouveau firmware depuis cette URL quand une mise à jour est disponible.\n\nExemple: https://votre-serveur.com/firmware/latest.bin">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        URL primaire
                      </label>
                    </Tooltip>
                  <input
                    type="url"
                    name="ota_primary_url"
                    value={formData.ota_primary_url ?? ''}
                    onChange={handleInputChange}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="https://..."
                    title="URL principale pour les mises à jour OTA. Exemple: https://votre-serveur.com/firmware/latest.bin"
                  />
                </div>
                <div>
                  <Tooltip content="URL de secours pour les mises à jour OTA.\n\nSi le téléchargement depuis l'URL primaire échoue, le dispositif essaie cette URL de secours.\n\nUtile pour la redondance.\n\nOptionnel mais recommandé pour la fiabilité.">
                      <label className="block text-xs font-medium mb-1 text-gray-700 dark:text-gray-300 cursor-help">
                        URL de secours
                      </label>
                    </Tooltip>
                  <input
                    type="url"
                    name="ota_fallback_url"
                    value={formData.ota_fallback_url || ''}
                    onChange={handleInputChange}
                    autoComplete="off"
                    className="input w-full text-sm py-1.5"
                    placeholder="https://..."
                    title="URL de secours si l'URL primaire échoue. Optionnel mais recommandé pour la fiabilité."
                  />
                </div>
              </div>
            </Accordion>
              </div>
            )}

          </div>

          {/* Boutons */}
          <div className="flex gap-2 justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
            {/* Bouton Reset (seulement en mode édition et si USB connecté) */}
            {editingItem && isDeviceUsbConnected && usbWrite && port && (
              <button
                type="button"
                className="btn-secondary text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                onClick={handleResetConfig}
                disabled={saving}
                title="Réinitialiser tous les paramètres aux valeurs par défaut (APN, PIN, Sleep, GPS, etc.)"
              >
                🔄 Reset par défaut
              </button>
            )}
            {/* Espaceur si pas de bouton reset */}
            {!(editingItem && isDeviceUsbConnected && usbWrite && port) && <div />}
            
            <div className="flex gap-2">
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
                {saving ? '⏳ Envoi en cours...' : (editingItem ? '📤 Envoyer au dispositif' : '✅ Créer le dispositif')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

