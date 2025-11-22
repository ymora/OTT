'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import AlertCard from '@/components/AlertCard'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import { useUsb } from '@/contexts/UsbContext'
import { decorateUsbInfo } from '@/lib/usbDevices'
import { startQueueProcessor, stopQueueProcessor } from '@/lib/measurementSender'
import logger from '@/lib/logger'
import Modal from '@/components/Modal'

// Lazy load des composants lourds pour accélérer Fast Refresh
const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false })
const Chart = dynamic(() => import('@/components/Chart'), { ssr: false })

// Constantes pour les commandes
const commandOptions = [
  { value: 'SET_SLEEP_SECONDS', label: 'Modifier intervalle de sommeil' },
  { value: 'PING', label: 'Ping / Diagnostic rapide' },
  { value: 'UPDATE_CONFIG', label: 'Mettre à jour la configuration' },
  { value: 'UPDATE_CALIBRATION', label: 'Recalibrer le capteur' },
  { value: 'OTA_REQUEST', label: 'Déclencher une mise à jour OTA' },
]

const priorityOptions = [
  { value: 'low', label: 'Basse' },
  { value: 'normal', label: 'Normale' },
  { value: 'high', label: 'Haute' },
  { value: 'critical', label: 'Critique' },
]

const commandStatusColors = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  executing: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  executed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  cancelled: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
}

export default function DevicesPage() {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const router = useRouter()
  
  // Utiliser le contexte USB global au lieu de dupliquer la logique
  const {
    port,
    isConnected,
    isSupported,
    requestPort,
    connect,
    disconnect,
    startReading,
    write,
    usbConnectedDevice,
    setUsbConnectedDevice,
    usbVirtualDevice,
    setUsbVirtualDevice,
    checkingUSB,
    setCheckingUSB,
    usbPortInfo,
    setUsbPortInfo,
    autoDetecting,
    setAutoDetecting,
    usbStreamStatus,
    usbStreamMeasurements,
    usbStreamLogs,
    usbStreamError,
    usbStreamLastMeasurement,
    startUsbStreaming,
    stopUsbStreaming,
    ensurePortReady,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback
  } = useUsb()
  
  const [searchTerm, setSearchTerm] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  
  // Modal détails/journal
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [deviceDetails, setDeviceDetails] = useState(null)
  const [deviceLogs, setDeviceLogs] = useState([])
  const [deviceAlerts, setDeviceAlerts] = useState([])
  const [deviceMeasurements, setDeviceMeasurements] = useState([])
  const [deviceCommands, setDeviceCommands] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [modalActiveTab, setModalActiveTab] = useState('details') // 'details', 'alerts', 'logs', 'commands'
  
  // Modal Upload Firmware
  const [showUploadFirmwareModal, setShowUploadFirmwareModal] = useState(false)
  const [firmwareFile, setFirmwareFile] = useState(null)
  const [firmwareVersion, setFirmwareVersion] = useState('')
  const [firmwareReleaseNotes, setFirmwareReleaseNotes] = useState('')
  const [firmwareIsStable, setFirmwareIsStable] = useState(false)
  const [uploadingFirmware, setUploadingFirmware] = useState(false)
  const [firmwareUploadError, setFirmwareUploadError] = useState(null)
  const [firmwareUploadSuccess, setFirmwareUploadSuccess] = useState(null)
  
  // État pour les messages OTA
  const [otaError, setOtaError] = useState(null)
  const [otaMessage, setOtaMessage] = useState(null)
  
  // État pour le formulaire de commandes dans le modal
  const [commandForm, setCommandForm] = useState({
    command: 'SET_SLEEP_SECONDS',
    sleepSeconds: 300,
    message: '',
    priority: 'normal',
    expiresInMinutes: 60,
    configApn: '',
    configJwt: '',
    configIccid: '',
    configSerial: '',
    configSimPin: '',
    configSleepMinutes: '',
    configAirflowPasses: '',
    configAirflowSamples: '',
    configAirflowDelay: '',
    configWatchdogSeconds: '',
    configModemBootTimeout: '',
    configSimReadyTimeout: '',
    configNetworkAttachTimeout: '',
    configModemReboots: '',
    configOtaPrimaryUrl: '',
    configOtaFallbackUrl: '',
    configOtaMd5: '',
    calA0: '',
    calA1: '',
    calA2: '',
    otaUrl: '',
    otaChannel: 'primary',
    otaMd5: '',
  })
  const [commandError, setCommandError] = useState(null)
  const [commandSuccess, setCommandSuccess] = useState(null)
  const [creatingCommand, setCreatingCommand] = useState(false)
  const [commandRefreshTick, setCommandRefreshTick] = useState(0)
  
  // Modal assignation
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignTargetDevice, setAssignTargetDevice] = useState(null)
  const [assignForm, setAssignForm] = useState({ patient_id: '' })
  const [assignError, setAssignError] = useState(null)
  const [assignLoading, setAssignLoading] = useState(false)

  // Notifications détection USB
  const [usbDetectionNotice, setUsbDetectionNotice] = useState(null)
  const [usbDetectionError, setUsbDetectionError] = useState(null)
  
  // Focus sur la carte
  const [focusDeviceId, setFocusDeviceId] = useState(null)
  
  // Ref pour la détection USB (persiste entre les renders)
  const detectionRef = useRef({ inProgress: false, lastCheck: 0 })
  
  // État pour la suppression
  const [deletingDevice, setDeletingDevice] = useState(null)
  const [deleteError, setDeleteError] = useState(null)
  const [deleteSuccess, setDeleteSuccess] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deviceToDelete, setDeviceToDelete] = useState(null)
  const notifyDevicesUpdated = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ott-devices-updated'))
      try {
        window.localStorage.setItem('ott-devices-last-update', Date.now().toString())
      } catch (err) {
        logger.warn('Impossible d\'écrire dans localStorage pour la sync devices:', err)
      }
    }
  }, [])

  // Charger les données initiales avec useApiData
  const { data, loading, error, refetch } = useApiData(
    ['/api.php/devices', '/api.php/patients', '/api.php/firmwares'],
    { requiresAuth: true }
  )

  // Configurer le callback pour envoyer les mesures USB à l'API avec queue et retry
  useEffect(() => {
    let stopProcessor = null

    const sendMeasurementToApi = async (measurementData) => {
      const response = await fetchWithAuth(`${API_URL}/api.php/devices/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(measurementData)
      }, { requiresAuth: true })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
      }
      
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Erreur API')
      }
      
      // Rafraîchir les données pour mettre à jour les informations du dispositif
      refetch()
    }
    
    setSendMeasurementCallback(sendMeasurementToApi)
    
    // Fonction pour mettre à jour automatiquement le firmware_version dans la base
    const updateDeviceFirmwareVersion = async (identifier, firmwareVersion) => {
      if (!identifier || !firmwareVersion) {
        logger.debug('⚠️ Identifiant ou version firmware manquant pour mise à jour')
        return
      }
      
      try {
        // Chercher le dispositif par ICCID ou Serial
        const devicesResponse = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/devices',
          { method: 'GET' },
          { requiresAuth: true }
        )
        const allDevices = devicesResponse.devices || []
        
        // Trouver le dispositif correspondant
        // Essayer correspondance exacte d'abord
        let device = allDevices.find(d => {
          if (d.sim_iccid && d.sim_iccid === identifier) return true
          if (d.device_serial && d.device_serial === identifier) return true
          if (d.device_name && d.device_name === identifier) return true
          return false
        })
        
        // Si pas trouvé, essayer correspondance partielle
        if (!device) {
          device = allDevices.find(d => {
            if (d.sim_iccid && (d.sim_iccid.includes(identifier) || identifier.includes(d.sim_iccid))) return true
            if (d.device_serial && (d.device_serial.includes(identifier) || identifier.includes(d.device_serial))) return true
            if (d.device_name && (d.device_name.includes(identifier) || identifier.includes(d.device_name))) return true
            return false
          })
        }
        
        // Si toujours pas trouvé et que l'identifiant ressemble à un USB-xxx:yyy, chercher par USB ID
        if (!device && identifier.match(/USB-([a-f0-9:]+)/i)) {
          const usbIdMatch = identifier.match(/USB-([a-f0-9:]+)/i)
          if (usbIdMatch) {
            const usbId = usbIdMatch[1].toLowerCase()
            device = allDevices.find(d => {
              if (d.device_name) {
                const nameMatch = d.device_name.match(/USB-([a-f0-9:]+)/i)
                if (nameMatch && nameMatch[1].toLowerCase() === usbId) return true
                if (d.device_name.toLowerCase().includes(usbId)) return true
              }
              return false
            })
          }
        }
        
        if (!device) {
          logger.debug('⚠️ Dispositif non trouvé pour mise à jour firmware_version:', identifier)
          return
        }
        
        // Vérifier si la version a changé
        if (device.firmware_version === firmwareVersion) {
          logger.debug('✅ Firmware_version déjà à jour:', firmwareVersion)
          return
        }
        
        // Mettre à jour le firmware_version
        logger.log('🔄 Mise à jour firmware_version:', { device: device.device_name, old: device.firmware_version, new: firmwareVersion })
        await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/devices/${device.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({ firmware_version: firmwareVersion })
          },
          { requiresAuth: true }
        )
        
        logger.log('✅ Firmware_version mis à jour avec succès')
        refetch() // Rafraîchir les données
      } catch (err) {
        logger.warn('⚠️ Erreur mise à jour firmware_version:', err)
      }
    }
    
    setUpdateDeviceFirmwareCallback(updateDeviceFirmwareVersion)
    
    // Démarrer le traitement de la queue des mesures en attente
    stopProcessor = startQueueProcessor(sendMeasurementToApi, { interval: 30000 })
    
    return () => {
      setSendMeasurementCallback(null)
      setUpdateDeviceFirmwareCallback(null)
      if (stopProcessor) {
        stopProcessor()
      }
      stopQueueProcessor()
    }
  }, [fetchWithAuth, API_URL, refetch, setSendMeasurementCallback, setUpdateDeviceFirmwareCallback])

  // Rafraîchissement automatique toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 30000) // 30 secondes
    
    return () => clearInterval(interval)
  }, [refetch])

  const devices = data?.devices?.devices || []
  const patients = data?.patients?.patients || []
  const firmwares = data?.firmwares?.firmwares || []

  // Fonction pour détecter un dispositif sur un port (définie en premier)
  const detectDeviceOnPort = useCallback(async (targetPort) => {
    try {
      const describeDevice = (device) =>
        device?.device_name ||
        device?.sim_iccid ||
        device?.device_serial ||
        (device?.isVirtual ? 'Dispositif USB virtuel' : 'Dispositif USB')

      setUsbDetectionError(null)
      setUsbDetectionNotice(null)

      const portInfo = decorateUsbInfo(targetPort.getInfo())
      setUsbPortInfo(portInfo)
      logger.log('🔌 Connexion au port:', portInfo)
      
      // Connecter automatiquement
      const connected = await connect(targetPort, 115200)
      if (!connected) {
        logger.warn('❌ Échec de connexion au port')
        return null
      }
      logger.log('✅ Port connecté, envoi des commandes AT...')

      // Lire l'ICCID/serial/firmware en continu
      let iccid = null
      let deviceSerial = null
      let firmwareVersion = null
      let receivedData = ''
      let lastDataUpdate = Date.now()

      const stopReading = await startReading((data) => {
        receivedData += data
        lastDataUpdate = Date.now()
        
        // Log toutes les données reçues en temps réel pour debug
        logger.log('📥 Données brutes reçues:', data)
        
        // Log en temps réel pour debug (limité pour éviter le spam)
        if (receivedData.length % 100 === 0) {
          logger.debug('📥 Total données reçues:', receivedData.length, 'caractères')
        }
        
        // Parser les messages JSON du firmware (device_info envoyé automatiquement)
        const lines = data.split(/\r?\n/).filter(l => l.trim())
        for (const line of lines) {
          if (line.trim().startsWith('{')) {
            try {
              const jsonData = JSON.parse(line.trim())
              if (jsonData.type === 'device_info') {
                // Le firmware a envoyé automatiquement les infos du dispositif
                // Validation que c'est un dispositif OTT
                const isOttDevice = jsonData.firmware_version && (
                  jsonData.firmware_version.startsWith('3.') || 
                  jsonData.firmware_version.includes('OTT') ||
                  jsonData.firmware_version.match(/^\d+\.\d+/)
                )
                
                if (!isOttDevice) {
                  logger.warn('⚠️ Dispositif non-OTT détecté (firmware_version:', jsonData.firmware_version, ')')
                } else {
                  logger.log('✅ Dispositif OTT reconnu via device_info')
                }
                
                if (jsonData.iccid && jsonData.iccid.length >= 10) {
                  iccid = jsonData.iccid
                  logger.log('✅ ICCID reçu depuis device_info:', iccid)
                }
                if (jsonData.serial && jsonData.serial.length > 0) {
                  deviceSerial = jsonData.serial
                  logger.log('✅ Serial reçu depuis device_info:', deviceSerial)
                }
                if (jsonData.firmware_version && jsonData.firmware_version.length > 0) {
                  firmwareVersion = jsonData.firmware_version
                  logger.log('✅ Firmware reçu depuis device_info:', firmwareVersion)
                }
                // Si on a toutes les infos, on peut arrêter d'attendre
                if (iccid || deviceSerial) {
                  logger.log('✅ Infos complètes reçues depuis device_info, arrêt de l\'écoute')
                  if (stopReading) stopReading()
                }
              }
            } catch (err) {
              // Pas un JSON valide, continuer avec les autres formats
            }
          }
        }
        
        // ICCID - plusieurs formats possibles (fallback si device_info n'a pas fonctionné)
        // Format AT+CCID: 89330123456789012345
        const iccidMatch1 = receivedData.match(/\+CCID[:\s]+(\d{19,20})/i)
        // Format CCID: 89330123456789012345
        const iccidMatch2 = receivedData.match(/CCID[:\s]+(\d{19,20})/i)
        // Format brut: 89330123456789012345 (19-20 chiffres consécutifs)
        const iccidMatch3 = receivedData.match(/(\d{19,20})/)
        // Format JSON: "iccid":"89330123456789012345"
        const iccidMatch4 = receivedData.match(/["']iccid["'][:\s]+["']?(\d{19,20})["']?/i)
        // Format sim_iccid dans JSON
        const iccidMatch5 = receivedData.match(/["']sim_iccid["'][:\s]+["']?(\d{19,20})["']?/i)
        
        const iccidMatch = iccidMatch1 || iccidMatch2 || iccidMatch4 || iccidMatch5 || iccidMatch3
        if (iccidMatch && iccidMatch[1] && !iccid) {
          const newIccid = iccidMatch[1].trim()
          // Vérifier que c'est un ICCID valide (19-20 chiffres)
          if (newIccid.length >= 19 && newIccid.length <= 20 && /^\d+$/.test(newIccid)) {
            iccid = newIccid
            logger.log('✅ ICCID détecté:', iccid)
          }
        }
        
        // Serial - plusieurs formats (fallback)
        if (!deviceSerial) {
          const serialMatch = receivedData.match(/SERIAL[:\s=]+([A-Z0-9\-]+)/i) || 
                             receivedData.match(/IMEI[:\s=]+([A-Z0-9]+)/i) ||
                             receivedData.match(/["']serial["'][:\s]+["']?([A-Z0-9\-]+)["']?/i)
          if (serialMatch && serialMatch[1]) {
            deviceSerial = serialMatch[1].trim()
            logger.log('✅ Serial détecté:', deviceSerial)
          }
        }
        
        // Firmware version - plusieurs formats (fallback)
        if (!firmwareVersion) {
          const fwMatch = receivedData.match(/FIRMWARE[:\s=]+([\d.]+)/i) || 
                         receivedData.match(/VERSION[:\s=]+([\d.]+)/i) ||
                         receivedData.match(/FWVER[:\s=]+([\d.]+)/i) ||
                         receivedData.match(/\+CGMR[:\s]+([^\r\n]+)/i) ||
                         receivedData.match(/\+GMR[:\s]+([^\r\n]+)/i) ||
                         receivedData.match(/["']firmware_version["'][:\s]+["']?([\d.]+)["']?/i) ||
                         receivedData.match(/v?(\d+\.\d+\.\d+)/i) ||
                         receivedData.match(/(\d+\.\d+\.\d+)/)
          if (fwMatch && fwMatch[1]) {
            firmwareVersion = fwMatch[1].trim().replace(/[^\d.]/g, '').substring(0, 20)
            logger.log('✅ Firmware détecté:', firmwareVersion)
          }
        }
      })

      // Attendre un peu que la connexion soit stable et que le firmware envoie device_info
      logger.log('👂 Attente des infos automatiques du firmware (device_info)...')
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Si on n'a pas encore reçu les infos via device_info, envoyer les commandes AT en fallback
      if (!iccid && !deviceSerial) {
        logger.log('📤 Infos non reçues automatiquement, envoi des commandes AT (fallback)...')
        await write('AT\r\n') // Test de connexion
        await new Promise(resolve => setTimeout(resolve, 1000))
        await write('AT+CCID\r\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
        await write('AT+GSN\r\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
        await write('AT+CGMR\r\n') // Version firmware modem
        await new Promise(resolve => setTimeout(resolve, 2000))
        await write('AT+GMR\r\n') // Version firmware alternative
        await new Promise(resolve => setTimeout(resolve, 2000))
        await write('ATI\r\n') // Informations générales
        await new Promise(resolve => setTimeout(resolve, 2000))
        // Commandes custom OTT si disponibles
        await write('AT+FIRMWARE?\r\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
        await write('AT+VERSION?\r\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
        await write('AT+FWVER?\r\n')
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Continuer à écouter pendant 3 secondes supplémentaires
        logger.log('👂 Écoute continue des données série (3 secondes)...')
        await new Promise(resolve => setTimeout(resolve, 3000))
      } else {
        logger.log('✅ Infos reçues automatiquement, pas besoin de commandes AT')
      }
      
      // Vérifier si de nouvelles données arrivent encore
      const checkInterval = setInterval(() => {
        const timeSinceLastData = Date.now() - lastDataUpdate
        if (timeSinceLastData > 2000) {
          // Pas de nouvelles données depuis 2 secondes, on peut arrêter
          clearInterval(checkInterval)
        }
      }, 500)
      
      // Attendre encore 1 seconde pour être sûr d'avoir toutes les données
      await new Promise(resolve => setTimeout(resolve, 1000))
      clearInterval(checkInterval)

      if (stopReading) stopReading()

      // Log des données brutes reçues (TOUTES les données pour debug)
      logger.log('📥 ===== ANALYSE COMPLÈTE DES DONNÉES REÇUES =====')
      logger.log('📥 Longueur totale:', receivedData.length, 'caractères')
      logger.log('📥 Données complètes:')
      logger.log(receivedData)
      logger.log('📥 ===== FIN DES DONNÉES =====')
      
      // Analyser ligne par ligne pour mieux comprendre le format
      const lines = receivedData.split(/\r?\n/).filter(l => l.trim())
      logger.log('📥 Nombre de lignes:', lines.length)
      logger.log('📥 Premières lignes:')
      lines.slice(0, 20).forEach((line, idx) => {
        logger.log(`   ${idx + 1}: ${line}`)
      })
      if (lines.length > 20) {
        logger.log(`   ... (${lines.length - 20} lignes supplémentaires)`)
      }
      
      // Log des données détectées
      logger.log('📊 Données détectées:', { 
        iccid: iccid || 'NON TROUVÉ', 
        deviceSerial: deviceSerial || 'NON TROUVÉ', 
        firmwareVersion: firmwareVersion || 'NON TROUVÉ', 
        receivedDataLength: receivedData.length 
      })
      
      // Si aucune donnée reçue, avertir
      if (receivedData.length === 0) {
        logger.warn('⚠️ Aucune donnée reçue du dispositif. Vérifiez:')
        logger.warn('   1. Le câble USB est bien connecté')
        logger.warn('   2. Le dispositif est allumé')
        logger.warn('   3. Le baudrate est correct (115200)')
        logger.warn('   4. Le port série n\'est pas utilisé par un autre programme')
      } else if (!iccid && !deviceSerial) {
        logger.warn('⚠️ Données reçues mais ICCID/Serial non détecté.')
        logger.warn('   Les données reçues peuvent être dans un format non reconnu.')
        logger.warn('   Vérifiez les logs ci-dessus pour voir le format exact.')
      }

      // Chercher dans la base AVANT de créer un nouveau dispositif
      let foundDevice = null
      
      // Récupérer directement les dispositifs depuis l'API pour avoir les données à jour
      let currentDevices = devices
      try {
        const devicesResponse = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/devices',
          { method: 'GET' },
          { requiresAuth: true }
        )
        currentDevices = devicesResponse.devices || []
        logger.log('📋 Dispositifs chargés depuis l\'API:', currentDevices.length)
      } catch (err) {
        logger.warn('⚠️ Erreur chargement dispositifs depuis API, utilisation du cache:', err)
        // Utiliser les dispositifs en cache si l'API échoue
      }
      
      // Chercher par ICCID (plusieurs variantes, par ordre de priorité)
      if (iccid && iccid !== 'N/A' && iccid.length >= 10) {
        // 1. Correspondance exacte (priorité maximale)
        foundDevice = currentDevices.find(d => {
          if (!d.sim_iccid) return false
          return d.sim_iccid === iccid
        })
        if (foundDevice) {
          logger.log('✅ Dispositif trouvé par ICCID (correspondance exacte):', foundDevice.device_name || foundDevice.sim_iccid)
        } else {
          // 2. Correspondance partielle (l'un contient l'autre)
          foundDevice = currentDevices.find(d => {
            if (!d.sim_iccid) return false
            return d.sim_iccid.includes(iccid) || iccid.includes(d.sim_iccid)
          })
          if (foundDevice) {
            logger.log('✅ Dispositif trouvé par ICCID (correspondance partielle):', foundDevice.device_name || foundDevice.sim_iccid)
          } else {
            // 3. Correspondance par les 8 derniers chiffres (dernier recours)
            const lastDigits = iccid.slice(-8)
            foundDevice = currentDevices.find(d => {
              if (!d.sim_iccid) return false
              return d.sim_iccid.includes(lastDigits)
            })
            if (foundDevice) {
              logger.log('✅ Dispositif trouvé par ICCID (8 derniers chiffres):', foundDevice.device_name || foundDevice.sim_iccid)
            }
          }
        }
      }
      
      // Chercher par Serial si pas trouvé par ICCID
      if (!foundDevice && deviceSerial && deviceSerial !== 'N/A') {
        foundDevice = currentDevices.find(d => {
          if (!d.device_serial) return false
          // Correspondance exacte ou partielle
          return d.device_serial === deviceSerial || 
                 d.device_serial.includes(deviceSerial) || 
                 deviceSerial.includes(d.device_serial)
        })
        if (foundDevice) {
          logger.log('✅ Dispositif trouvé par Serial:', foundDevice.device_name || foundDevice.device_serial)
        }
      }
      
      // Chercher par device_name (USB-xxx:yyy) si pas trouvé par ICCID/Serial
      if (!foundDevice && portInfo.usbVendorId && portInfo.usbProductId) {
        const usbId = `${portInfo.usbVendorId.toString(16)}:${portInfo.usbProductId.toString(16)}`
        foundDevice = currentDevices.find(d => {
          if (!d.device_name) return false
          // Chercher par USB-xxx:yyy dans le nom
          const nameMatch = d.device_name.match(/USB-([a-f0-9:]+)/i)
          if (nameMatch && nameMatch[1]) {
            return nameMatch[1].toLowerCase() === usbId.toLowerCase() || 
                   nameMatch[1].toLowerCase().includes(usbId.toLowerCase()) ||
                   usbId.toLowerCase().includes(nameMatch[1].toLowerCase())
          }
          // Correspondance directe
          return d.device_name.toLowerCase().includes(usbId.toLowerCase())
        })
        if (foundDevice) {
          logger.log('✅ Dispositif trouvé par device_name (USB ID):', foundDevice.device_name)
        }
      }

      if (foundDevice) {
        // Dispositif trouvé en base, utiliser celui-ci et NE PAS créer de virtuel
        setUsbConnectedDevice(foundDevice)
        setUsbVirtualDevice(null)
        
        // Mettre à jour last_seen dans la base pour indiquer que le dispositif a été vu
        try {
          logger.log('🔄 Mise à jour last_seen pour le dispositif USB...')
          await fetchJson(
            fetchWithAuth,
            API_URL,
            `/api.php/devices/${foundDevice.id}`,
            {
              method: 'PUT',
              body: JSON.stringify({ 
                last_seen: new Date().toISOString()
              })
            },
            { requiresAuth: true }
          )
          logger.log('✅ last_seen mis à jour avec succès')
        } catch (err) {
          logger.debug('⚠️ Impossible de mettre à jour last_seen (non critique):', err)
        }
        
        await refetch() // Recharger pour synchroniser
        notifyDevicesUpdated()
        logger.log('🔌 Dispositif USB connecté (enregistré):', foundDevice.device_name || foundDevice.sim_iccid)
        setUsbDetectionNotice({
          type: 'success',
          message: `${describeDevice(foundDevice)} détecté (déjà présent en base).`
        })
        return foundDevice
      } else {
        // Si aucun identifiant n'a été trouvé mais un dispositif est sélectionné, permettre l'association manuelle
        if (!foundDevice && selectedDevice) {
          logger.log('🔗 Association manuelle au dispositif sélectionné:', selectedDevice.device_name || selectedDevice.sim_iccid)
          setUsbConnectedDevice(selectedDevice)
          setUsbVirtualDevice(null)
          setUsbDetectionNotice({
            type: 'success',
            message: `${describeDevice(selectedDevice)} associé manuellement. Les mesures USB seront rattachées à ce dispositif.`
          })
          return selectedDevice
        }

        // Dispositif non trouvé, essayer de le créer seulement si on a un ICCID ou Serial valide
        const deviceIdentifier = iccid && iccid !== 'N/A' && iccid.length >= 10 ? iccid.slice(-4) : 
                                deviceSerial && deviceSerial !== 'N/A' ? deviceSerial.slice(-4) : 
                                portInfo.usbVendorId && portInfo.usbProductId ? 
                                  `${portInfo.usbVendorId.toString(16)}:${portInfo.usbProductId.toString(16)}` : 
                                  null
        
        // Ne créer que si on a un identifiant valide
        if (!deviceIdentifier || deviceIdentifier === 'UNKNOWN') {
          logger.warn('⚠️ Impossible de créer le dispositif: identifiant insuffisant')
          // Créer un virtuel temporaire
          const virtualDevice = {
            id: 'usb_virtual_' + Date.now(),
            device_name: `USB-${Date.now()}`,
            sim_iccid: iccid || 'N/A',
            device_serial: deviceSerial || 'N/A',
            firmware_version: firmwareVersion || 'N/A',
            status: 'usb_connected',
            last_seen: new Date().toISOString(),
            last_battery: null,
            patient_id: null,
            isVirtual: true,
            usbPortInfo: portInfo
          }
          setUsbVirtualDevice(virtualDevice)
          setUsbConnectedDevice(null)
          logger.log('🔌 Dispositif USB virtuel créé (identifiant insuffisant):', virtualDevice.device_name)
          setUsbDetectionNotice({
            type: 'info',
            message: 'Identifiant incomplet : dispositif affiché en mode virtuel seulement. Relancez la détection après le flash/boot.'
          })
          return virtualDevice
        }
        
        const deviceName = `USB-${deviceIdentifier}`
        const simIccid = (iccid && iccid !== 'N/A' && iccid.length >= 10) ? iccid : null
        
        try {
          logger.log('📝 Tentative de création du dispositif USB dans la base de données...')
          const createdDevice = await fetchJson(
            fetchWithAuth,
            API_URL,
            '/api.php/devices',
            {
              method: 'POST',
              body: JSON.stringify({
                device_name: deviceName,
                sim_iccid: simIccid,
                device_serial: (deviceSerial && deviceSerial !== 'N/A') ? deviceSerial : null,
                firmware_version: (firmwareVersion && firmwareVersion !== 'N/A') ? firmwareVersion : null,
                status: 'inactive' // Dispositif USB non encore actif en radio
              })
            },
            { requiresAuth: true }
          )
          
          if (createdDevice.device) {
            logger.log('✅ Dispositif USB créé dans la base:', createdDevice.device.id)
            setUsbConnectedDevice(createdDevice.device)
            setUsbVirtualDevice(null)
            await refetch()
            notifyDevicesUpdated()
            setUsbDetectionNotice({
              type: 'success',
              message: `${describeDevice(createdDevice.device)} créé et connecté automatiquement.`
            })
            return createdDevice.device
          }
        } catch (createErr) {
          // Si la création échoue avec "déjà utilisé", chercher à nouveau dans l'API
          if (createErr.error && (createErr.error.includes('déjà utilisé') || createErr.error.includes('déjà existant'))) {
            logger.log('⚠️ Dispositif déjà existant (ICCID/Serial utilisé), recherche dans l\'API...')
            try {
              // Recharger depuis l'API
              const devicesResponse = await fetchJson(
                fetchWithAuth,
                API_URL,
                '/api.php/devices',
                { method: 'GET' },
                { requiresAuth: true }
              )
              const allDevicesFromApi = devicesResponse.devices || []
              
              // Chercher plus largement
              const existingDevice = allDevicesFromApi.find(d => {
                // Par ICCID
                if (simIccid && d.sim_iccid) {
                  if (d.sim_iccid === simIccid || 
                      d.sim_iccid.includes(simIccid) || 
                      simIccid.includes(d.sim_iccid) ||
                      d.sim_iccid.includes(simIccid.slice(-8))) {
                    return true
                  }
                }
                // Par Serial
                if (deviceSerial && d.device_serial) {
                  if (d.device_serial === deviceSerial || 
                      d.device_serial.includes(deviceSerial) || 
                      deviceSerial.includes(d.device_serial)) {
                    return true
                  }
                }
                // Par nom (dernière chance)
                if (d.device_name && d.device_name.includes(deviceIdentifier)) {
                  return true
                }
                return false
              })
              
              if (existingDevice) {
                logger.log('✅ Dispositif existant trouvé après erreur:', existingDevice.device_name || existingDevice.sim_iccid)
                setUsbConnectedDevice(existingDevice)
                setUsbVirtualDevice(null)
                await refetch()
                notifyDevicesUpdated()
                setUsbDetectionNotice({
                  type: 'success',
                  message: `${describeDevice(existingDevice)} détecté (déjà présent en base).`
                })
                return existingDevice
              } else {
                logger.warn('⚠️ Dispositif non trouvé malgré l\'erreur "déjà utilisé". Création d\'un virtuel.')
              }
            } catch (searchErr) {
              logger.error('Erreur lors de la recherche après création échouée:', searchErr)
            }
          } else {
            logger.warn('⚠️ Erreur création dispositif USB en base:', createErr)
            setUsbDetectionError(createErr.message || 'Impossible de créer le dispositif USB.')
          }
          
          // Si on arrive ici, créer un dispositif virtuel temporaire
          const virtualDevice = {
            id: 'usb_virtual_' + Date.now(),
            device_name: deviceName,
            sim_iccid: simIccid || 'N/A',
            device_serial: deviceSerial || 'N/A',
            firmware_version: firmwareVersion || 'N/A',
            status: 'usb_connected',
            last_seen: new Date().toISOString(),
            last_battery: null,
            patient_id: null,
            isVirtual: true,
            usbPortInfo: portInfo
          }
          setUsbVirtualDevice(virtualDevice)
          setUsbConnectedDevice(null)
          logger.log('🔌 Dispositif USB virtuel créé (création en base échouée):', virtualDevice.device_name)
          logger.log('   ⚠️ Ce dispositif virtuel ne peut pas être assigné à un patient')
          setUsbDetectionNotice({
            type: 'info',
            message: 'Création impossible (API). Dispositif affiché en virtuel non assignable.'
          })
          return virtualDevice
        }
      }
    } catch (err) {
      logger.error('Erreur détection dispositif:', err)
      setUsbDetectionError(err.message || 'Erreur pendant la détection USB.')
      return null
    }
  }, [connect, startReading, write, devices, fetchWithAuth, API_URL, refetch, notifyDevicesUpdated, setUsbConnectedDevice, setUsbPortInfo, setUsbVirtualDevice, setUsbDetectionError, setUsbDetectionNotice, selectedDevice])

  // Détecter le dispositif connecté en USB (pour autoriser un nouveau port)
  const detectUSBDevice = useCallback(async () => {
    if (!isSupported) {
      alert('Web Serial API non supporté. Utilisez Chrome ou Edge.')
      return
    }

    setCheckingUSB(true)
    setAutoDetecting(true)
    try {
      logger.log('🔍 Détection USB manuelle demandée...')
      
      // D'abord, vérifier les ports déjà autorisés
      const existingPorts = await navigator.serial.getPorts()
      logger.log(`📡 Ports déjà autorisés: ${existingPorts.length}`)
      
      // Si des ports existent, essayer de les utiliser d'abord
      if (existingPorts.length > 0) {
        logger.log('🔌 Tentative avec les ports déjà autorisés...')
        for (const p of existingPorts) {
          try {
            const device = await detectDeviceOnPort(p)
            if (device) {
              logger.log('✅ Dispositif trouvé sur port existant:', device.device_name || device.sim_iccid)
              setCheckingUSB(false)
              setAutoDetecting(false)
              return
            }
          } catch (portErr) {
            logger.warn('Erreur sur port existant:', portErr.message)
            // Continuer avec le port suivant
          }
        }
      }
      
      // Si aucun dispositif trouvé, demander un nouveau port
      logger.log('📱 Aucun dispositif trouvé, demande d\'autorisation d\'un nouveau port...')
      const selectedPort = await requestPort()
      if (!selectedPort) {
        logger.debug('Aucun port sélectionné par l\'utilisateur')
        setCheckingUSB(false)
        setAutoDetecting(false)
        return
      }

      logger.log('✅ Port sélectionné, détection en cours...')
      // Détecter le dispositif sur ce port
      const device = await detectDeviceOnPort(selectedPort)
      if (device) {
        logger.log('✅ Dispositif détecté:', device.device_name || device.sim_iccid)
      }
    } catch (err) {
      if (err.name === 'NotFoundError') {
        logger.debug('Aucun port sélectionné')
      } else {
        logger.error('Erreur détection USB:', err)
        alert(`Erreur lors de la détection: ${err.message}`)
      }
    } finally {
      setCheckingUSB(false)
      setAutoDetecting(false)
    }
  }, [isSupported, requestPort, detectDeviceOnPort, setAutoDetecting, setCheckingUSB])

  // Les fonctions USB (appendUsbStreamLog, processUsbStreamLine, handleUsbStreamChunk, 
  // startUsbStreaming, stopUsbStreaming, ensurePortReady) sont maintenant dans UsbContext
  // et accessibles via useUsb()

  // Déconnecter le port USB
  const disconnectUSB = useCallback(async () => {
    await disconnect()
    stopUsbStreaming()
    setUsbConnectedDevice(null)
    setUsbVirtualDevice(null)
    setUsbPortInfo(null)
    // Réactiver la détection automatique après déconnexion
    setAutoDetecting(true)
    logger.log('🔄 Détection automatique USB réactivée après déconnexion')
  }, [disconnect, stopUsbStreaming, setUsbConnectedDevice, setUsbVirtualDevice, setUsbPortInfo, setAutoDetecting])

  // Vérifier si le dispositif sélectionné correspond au dispositif USB connecté
  const isSelectedDeviceUsbConnected = useCallback(() => {
    if (!selectedDevice) return false
    if (!usbConnectedDevice && !usbVirtualDevice && !usbPortInfo) return false

    const deviceNamesMatch = (device) => {
      if (!device?.device_name || !selectedDevice.device_name) return false
      const connectedName = device.device_name.toLowerCase()
      const selectedName = selectedDevice.device_name.toLowerCase()
      if (connectedName === selectedName) return true

      const connectedUsbId = connectedName.match(/([0-9a-f]{4}:[0-9a-f]{4})/)
      const selectedUsbId = selectedName.match(/([0-9a-f]{4}:[0-9a-f]{4})/)
      if (connectedUsbId && selectedUsbId && connectedUsbId[1] === selectedUsbId[1]) {
        return true
      }
      return false
    }

    if (deviceNamesMatch(usbConnectedDevice) || deviceNamesMatch(usbVirtualDevice)) {
      return true
    }
    
    // Comparer par ID si disponible
    if (usbConnectedDevice && selectedDevice.id && usbConnectedDevice.id === selectedDevice.id) {
      return true
    }
    
    // Comparer par ICCID
    if (selectedDevice.sim_iccid) {
      if (usbConnectedDevice && usbConnectedDevice.sim_iccid && 
          usbConnectedDevice.sim_iccid.includes(selectedDevice.sim_iccid)) {
        return true
      }
      if (usbVirtualDevice && usbVirtualDevice.sim_iccid && 
          usbVirtualDevice.sim_iccid.includes(selectedDevice.sim_iccid)) {
        return true
      }
    }
    
    // Comparer par device_serial
    if (selectedDevice.device_serial) {
      if (usbConnectedDevice && usbConnectedDevice.device_serial && 
          usbConnectedDevice.device_serial.includes(selectedDevice.device_serial)) {
        return true
      }
      if (usbVirtualDevice && usbVirtualDevice.device_serial && 
          usbVirtualDevice.device_serial.includes(selectedDevice.device_serial)) {
        return true
      }
    }
    
    // Pour les dispositifs virtuels, comparer aussi par device_name si c'est un dispositif USB virtuel
    if (usbVirtualDevice && usbVirtualDevice.isVirtual && selectedDevice.device_name) {
      const sliced = selectedDevice.device_name.slice(-4)
      if (sliced && usbVirtualDevice.device_name && usbVirtualDevice.device_name.includes(sliced)) {
        return true
      }
    }

    // Comparer par identifiants USB (vendor/product) via device_name
    if (usbPortInfo && selectedDevice.device_name) {
      const usbMatch = selectedDevice.device_name.match(/([0-9a-f]{4}):([0-9a-f]{4})/i)
      if (usbMatch) {
        const vendorId = parseInt(usbMatch[1], 16)
        const productId = parseInt(usbMatch[2], 16)
        if (
          !Number.isNaN(vendorId) &&
          vendorId === usbPortInfo.usbVendorId &&
          (!usbPortInfo.usbProductId || productId === usbPortInfo.usbProductId)
        ) {
          return true
        }
      }
    }
    
    return false
  }, [selectedDevice, usbConnectedDevice, usbVirtualDevice, usbPortInfo])

  // Détection automatique au chargement et périodiquement (ports déjà autorisés)
  useEffect(() => {
    if (!isSupported) {
      setAutoDetecting(false)
      return
    }

    // Ne pas détecter si déjà un dispositif connecté
    if (usbConnectedDevice || usbVirtualDevice) {
      // Ne pas désactiver autoDetecting ici, juste ne pas lancer la détection
      // Cela permet de réactiver automatiquement la détection après déconnexion
      return
    }

    // S'assurer que la détection automatique est activée si aucun dispositif n'est connecté
    if (!autoDetecting) {
      setAutoDetecting(true)
      logger.log('🔄 Réactivation de la détection automatique USB')
    }

    const autoDetect = async () => {
      const now = Date.now()
      // Éviter les détections trop fréquentes (min 2 secondes entre chaque)
      if (detectionRef.current.inProgress || (now - detectionRef.current.lastCheck < 2000)) {
        return
      }
      
      detectionRef.current.inProgress = true
      detectionRef.current.lastCheck = now

      try {
        logger.log('🔍 Détection automatique USB...')
        
        // Récupérer les ports déjà autorisés (sans interaction utilisateur)
        const ports = await navigator.serial.getPorts()
        logger.log(`📡 Ports trouvés: ${ports.length}`)
        
        if (ports.length === 0) {
          logger.log('💡 Aucun port USB autorisé. Cliquez sur "🔍 Détecter USB" pour autoriser un port.')
          logger.log('   Ou connectez votre dispositif et autorisez-le dans la popup du navigateur')
          detectionRef.current.inProgress = false
          return
        }

        // Essayer tous les ports USB connectés
        for (const p of ports) {
          try {
            const info = p.getInfo()
            logger.log(`🔌 Test port: vendorId=${info.usbVendorId}, productId=${info.usbProductId}`)
            
            // Filtrer les ports USB
            if (info.usbVendorId || info.usbProductId) {
              logger.log('📱 Tentative de détection sur port USB...')
              const device = await detectDeviceOnPort(p)
              if (device) {
                logger.log('✅ Dispositif détecté:', device.device_name || device.sim_iccid)
                setAutoDetecting(false)
                detectionRef.current.inProgress = false
                return // Arrêter au premier dispositif trouvé
              } else {
                logger.log('⚠️ Aucun dispositif détecté sur ce port')
              }
            }
          } catch (portErr) {
            logger.warn('Erreur sur un port:', portErr.message)
          }
        }
        
        // Si pas de port USB spécifique, essayer le premier port
        if (!usbConnectedDevice && !usbVirtualDevice && ports.length > 0) {
          const firstPort = ports[0]
          const info = firstPort.getInfo()
          if (!info.usbVendorId && !info.usbProductId) {
            // Port série non-USB, essayer quand même
            logger.log('📱 Tentative sur port série non-USB...')
            const device = await detectDeviceOnPort(firstPort)
            if (device) {
              logger.log('✅ Dispositif détecté sur port série:', device.device_name || device.sim_iccid)
              setAutoDetecting(false)
              detectionRef.current.inProgress = false
              return
            }
          }
        }
        
        logger.log('⚠️ Aucun dispositif détecté sur les ports disponibles')
      } catch (err) {
        logger.error('Erreur détection automatique USB:', err)
      } finally {
        detectionRef.current.inProgress = false
      }
    }

    // Détection initiale immédiate si devices déjà chargés
    let initialTimer
    if (devices.length > 0 || !loading) {
      initialTimer = setTimeout(() => {
        autoDetect()
      }, 500) // Délai réduit à 500ms
    } else {
      // Sinon attendre le chargement
      initialTimer = setTimeout(() => {
        autoDetect()
      }, 2000)
    }

    // Détection périodique toutes les 3 secondes (plus agressif)
    const interval = setInterval(() => {
      if (!usbConnectedDevice && !usbVirtualDevice && !detectionRef.current.inProgress) {
        autoDetect()
      }
    }, 3000) // Toutes les 3 secondes

    return () => {
      if (initialTimer) clearTimeout(initialTimer)
      clearInterval(interval)
    }
  }, [isSupported, detectDeviceOnPort, usbConnectedDevice, usbVirtualDevice, devices.length, loading, setAutoDetecting])

  // Rediriger vers l'onglet "details" si l'utilisateur est sur "usb-stream" 
  // mais que le dispositif sélectionné ne correspond pas au dispositif USB connecté
  useEffect(() => {
    if (modalActiveTab === 'usb-stream' && !isSelectedDeviceUsbConnected()) {
      setModalActiveTab('details')
    }
  }, [modalActiveTab, isSelectedDeviceUsbConnected])

  // Démarrer automatiquement le streaming USB quand un dispositif est détecté
  useEffect(() => {
    if (!isSupported) return
    if (usbStreamStatus !== 'idle') return // Ne pas redémarrer si déjà en cours
    
    // Démarrer automatiquement le streaming si un dispositif USB est connecté
    if ((usbConnectedDevice || usbVirtualDevice) && isConnected && usbStreamStatus === 'idle') {
      // Si un dispositif est sélectionné, vérifier qu'il correspond au dispositif USB
      // Sinon, démarrer le streaming quand même (le dispositif sera automatiquement sélectionné)
      const shouldStart = !selectedDevice || isSelectedDeviceUsbConnected()
      
      if (shouldStart) {
        logger.log('🚀 Démarrage automatique du streaming USB pour le dispositif connecté...')
        // Petit délai pour laisser le port se stabiliser et recevoir device_info
        const timer = setTimeout(() => {
          startUsbStreaming().catch(err => {
            logger.warn('Erreur démarrage automatique streaming:', err)
          })
        }, 2000) // Augmenté à 2s pour laisser le temps au firmware d'envoyer device_info
        return () => clearTimeout(timer)
      }
    }
  }, [usbConnectedDevice, usbVirtualDevice, isConnected, isSupported, usbStreamStatus, startUsbStreaming, isSelectedDeviceUsbConnected, selectedDevice])

  // Écouter les nouveaux ports connectés (événement navigateur)
  useEffect(() => {
    if (!isSupported) return

    const handleConnect = async (event) => {
      try {
        logger.log('🔌 Nouveau port USB connecté détecté par le navigateur')
        // Le port est dans event.target
        if (event.target) {
          logger.log('📱 Tentative de détection automatique sur le nouveau port...')
          // S'assurer que la détection automatique est activée
          setAutoDetecting(true)
          const device = await detectDeviceOnPort(event.target)
          if (device) {
            logger.log('✅ Dispositif détecté sur le nouveau port:', device.device_name || device.sim_iccid)
            setAutoDetecting(false)
          } else {
            // Si pas de dispositif détecté, garder la détection active pour réessayer
            logger.log('⚠️ Aucun dispositif détecté sur le nouveau port, la détection automatique continue')
          }
        }
      } catch (err) {
        logger.error('Erreur lors de la détection du nouveau port:', err)
        // En cas d'erreur, réactiver la détection automatique
        setAutoDetecting(true)
      }
    }

    // Écouter l'événement 'connect' du navigateur (une seule fois)
    if (navigator.serial && typeof navigator.serial.addEventListener === 'function') {
      navigator.serial.addEventListener('connect', handleConnect)
      logger.log('👂 Écoute des événements de connexion USB activée')
    }

    return () => {
      if (navigator.serial && typeof navigator.serial.removeEventListener === 'function') {
        navigator.serial.removeEventListener('connect', handleConnect)
      }
    }
  }, [isSupported, detectDeviceOnPort, setAutoDetecting])



  // Fonction pour ouvrir le modal de suppression
  const openDeleteModal = (device) => {
    setDeviceToDelete(device)
    setShowDeleteModal(true)
    setDeleteError(null)
    setDeleteSuccess(null)
  }

  // Fonction pour fermer le modal de suppression
  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setDeviceToDelete(null)
    setDeleteError(null)
  }

  // Fonction pour supprimer un dispositif
  const handleDeleteDevice = async () => {
    if (!deviceToDelete) return

    try {
      setDeletingDevice(deviceToDelete.id)
      setDeleteError(null)
      setDeleteSuccess(null)
      
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${deviceToDelete.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      
      await refetch()
      notifyDevicesUpdated()
      setDeleteSuccess('Dispositif supprimé avec succès')
      setShowDeleteModal(false)
      setDeviceToDelete(null)
      
      // Fermer le modal de détails si c'était le dispositif supprimé
      if (showDetailsModal && selectedDevice && selectedDevice.id === deviceToDelete.id) {
        setShowDetailsModal(false)
        setSelectedDevice(null)
      }
    } catch (err) {
      let errorMessage = 'Erreur lors de la suppression du dispositif'
      if (err.message) {
        errorMessage = err.message
      } else if (err.error) {
        errorMessage = err.error
      }
      setDeleteError(errorMessage)
      logger.error('Erreur suppression dispositif:', err)
    } finally {
      setDeletingDevice(null)
    }
  }

  // Les données sont chargées automatiquement par useApiData

  // Combiner les dispositifs réels avec le dispositif virtuel USB
  // MAIS éviter les doublons si le dispositif USB est déjà enregistré
  const allDevices = useMemo(() => {
    const realDevices = [...devices]
    
    // Si un dispositif USB est connecté et trouvé en base, ne pas ajouter de virtuel
    if (usbConnectedDevice) {
      // Le dispositif est déjà dans la liste (devices), pas besoin d'ajouter de virtuel
      return realDevices
    }
    
    // Ajouter le dispositif virtuel USB seulement s'il n'existe pas déjà en base
    // Vérifier par ICCID, Serial ou nom pour éviter les doublons
    if (usbVirtualDevice) {
      const isDuplicate = realDevices.some(d => {
        // Vérifier par ICCID
        if (usbVirtualDevice.sim_iccid && d.sim_iccid && 
            (d.sim_iccid.includes(usbVirtualDevice.sim_iccid) || 
             usbVirtualDevice.sim_iccid.includes(d.sim_iccid))) {
          return true
        }
        // Vérifier par Serial
        if (usbVirtualDevice.device_serial && d.device_serial && 
            (d.device_serial.includes(usbVirtualDevice.device_serial) || 
             usbVirtualDevice.device_serial.includes(d.device_serial))) {
          return true
        }
        // Vérifier par nom (pour les dispositifs USB-XXXX)
        if (usbVirtualDevice.device_name && d.device_name && 
            d.device_name === usbVirtualDevice.device_name) {
          return true
        }
        return false
      })
      
      if (!isDuplicate && !realDevices.find(d => d.id === usbVirtualDevice.id)) {
        realDevices.push(usbVirtualDevice)
      }
    }
    
    return realDevices
  }, [devices, usbVirtualDevice, usbConnectedDevice])

  const filteredDevices = useMemo(() => {
    const needle = searchTerm.toLowerCase()
    return allDevices.filter(d => {
      // Les dispositifs virtuels USB doivent toujours apparaître (sauf si recherche spécifique)
      const isVirtualUSB = d.isVirtual && d.status === 'usb_connected'
      
      // Si recherche vide, inclure tous les dispositifs (y compris virtuels)
      // Si recherche non vide, vérifier si le dispositif virtuel matche
      const matchesSearch = searchTerm === '' || 
        d.device_name?.toLowerCase().includes(needle) ||
        d.sim_iccid?.includes(searchTerm) ||
        `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes(needle) ||
        (isVirtualUSB && (d.device_name?.toLowerCase().includes(needle) || 'usb'.includes(needle)))

      const isAssigned = Boolean(d.patient_id)
      const matchesAssignment =
        assignmentFilter === 'all' ||
        (assignmentFilter === 'assigned' && isAssigned) ||
        (assignmentFilter === 'unassigned' && !isAssigned) ||
        (isVirtualUSB && assignmentFilter === 'unassigned') // Dispositifs virtuels = non assignés

      return matchesSearch && matchesAssignment
    })
  }, [allDevices, searchTerm, assignmentFilter])

  // Trouver la dernière version de firmware disponible
  const latestFirmwareVersion = useMemo(() => {
    if (!firmwares || firmwares.length === 0) return null
    
    // Trier les versions par ordre décroissant (semantic versioning)
    const sorted = [...firmwares].sort((a, b) => {
      const versionA = a.version || '0.0.0'
      const versionB = b.version || '0.0.0'
      
      // Comparer les versions (ex: "1.2.3" -> [1, 2, 3])
      const partsA = versionA.split('.').map(Number)
      const partsB = versionB.split('.').map(Number)
      
      for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
        const partA = partsA[i] || 0
        const partB = partsB[i] || 0
        if (partA !== partB) {
          return partB - partA // Décroissant
        }
      }
      return 0
    })
    
    return sorted[0]?.version || null
  }, [firmwares])

  // Dispositifs qui ont un firmware différent du sélectionné (inclure les virtuels et N/A)

  const handleShowDetails = async (device) => {
    setSelectedDevice(device)
    setShowDetailsModal(true)
    setModalActiveTab('details')
    setLoadingDetails(true)
    setDeviceDetails(null)
    setDeviceLogs([])
    setDeviceAlerts([])
    setDeviceMeasurements([])
    setDeviceCommands([])
    
    // Pour les dispositifs virtuels USB, ne pas faire d'appels API
    if (device.isVirtual) {
      setDeviceDetails(device)
      setDeviceLogs([])
      setDeviceAlerts([])
      setDeviceMeasurements([])
      setDeviceCommands([])
      setLoadingDetails(false)
      return
    }
    
    try {
      const [logsData, alertsData, historyData, commandsData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, `/api.php/logs?device_id=${device.id}&limit=50`, {}, { requiresAuth: true }).catch(() => ({ logs: [] })),
        fetchJson(fetchWithAuth, API_URL, `/api.php/alerts?device_id=${device.id}`, {}, { requiresAuth: true }).catch(() => ({ alerts: [] })),
        fetchJson(fetchWithAuth, API_URL, `/api.php/device/${device.id}`, {}, { requiresAuth: true }).catch(() => ({ measurements: [] })),
        fetchJson(fetchWithAuth, API_URL, `/api.php/devices/commands?limit=100`, {}, { requiresAuth: true }).catch(() => ({ commands: [] }))
      ])
      setDeviceLogs(logsData.logs || [])
      // Filtrer les alertes pour ce dispositif uniquement (double vérification côté client)
      const allAlerts = alertsData.alerts || []
      const filteredAlerts = allAlerts.filter(a => {
        // Vérifier que l'alerte appartient bien à ce dispositif
        const alertDeviceId = a.device_id || a.deviceId
        return String(alertDeviceId) === String(device.id) && a.status !== 'resolved'
      })
      setDeviceAlerts(filteredAlerts)
      setDeviceMeasurements(historyData.measurements || [])
      // Filtrer les commandes pour ce dispositif uniquement
      const filteredCommands = (commandsData.commands || []).filter(cmd => 
        String(cmd.device_id) === String(device.id) || cmd.sim_iccid === device.sim_iccid
      )
      setDeviceCommands(filteredCommands)
      setDeviceDetails(device)
    } catch (err) {
      logger.error(err)
    } finally {
      setLoadingDetails(false)
    }
  }

  // Charger les commandes pour le dispositif sélectionné
  const loadDeviceCommands = useCallback(async () => {
    if (!selectedDevice) return
    // Pour les dispositifs virtuels, ne pas faire d'appel API
    if (selectedDevice.isVirtual) {
      setDeviceCommands([])
      return
    }
    try {
      const commandsData = await fetchJson(
        fetchWithAuth, 
        API_URL, 
        `/api.php/devices/commands?limit=100`, 
        {}, 
        { requiresAuth: true }
      ).catch(() => ({ commands: [] }))
      
      const filteredCommands = (commandsData.commands || []).filter(cmd => 
        String(cmd.device_id) === String(selectedDevice.id) || cmd.sim_iccid === selectedDevice.sim_iccid
      )
      setDeviceCommands(filteredCommands)
    } catch (err) {
      logger.error('Erreur chargement commandes:', err)
    }
  }, [selectedDevice, fetchWithAuth, API_URL])

  useEffect(() => {
    if (modalActiveTab === 'commands' && selectedDevice) {
      loadDeviceCommands()
    }
  }, [modalActiveTab, selectedDevice, commandRefreshTick, loadDeviceCommands])

  // Fonction pour envoyer une commande depuis le modal
  const handleCreateCommand = async (e) => {
    e.preventDefault()
    if (!selectedDevice) return

    const payload = {}
    if (commandForm.command === 'SET_SLEEP_SECONDS') {
      payload.seconds = Number(commandForm.sleepSeconds) || 300
    } else if (commandForm.command === 'PING') {
      payload.message = commandForm.message?.trim() || 'PING'
    } else if (commandForm.command === 'UPDATE_CONFIG') {
      const addString = (key, value) => {
        const trimmed = (value ?? '').trim()
        if (trimmed) payload[key] = trimmed
      }
      const addNumber = (key, value) => {
        if (value === '' || value === null || value === undefined) return
        const num = Number(value)
        if (Number.isFinite(num)) {
          payload[key] = num
        }
      }
      addString('apn', commandForm.configApn)
      addString('jwt', commandForm.configJwt)
      addString('iccid', commandForm.configIccid)
      addString('serial', commandForm.configSerial)
      addString('sim_pin', commandForm.configSimPin)
      addNumber('sleep_minutes_default', commandForm.configSleepMinutes)
      addNumber('airflow_passes', commandForm.configAirflowPasses)
      addNumber('airflow_samples_per_pass', commandForm.configAirflowSamples)
      addNumber('airflow_delay_ms', commandForm.configAirflowDelay)
      addNumber('watchdog_seconds', commandForm.configWatchdogSeconds)
      addNumber('modem_boot_timeout_ms', commandForm.configModemBootTimeout)
      addNumber('sim_ready_timeout_ms', commandForm.configSimReadyTimeout)
      addNumber('network_attach_timeout_ms', commandForm.configNetworkAttachTimeout)
      addNumber('modem_max_reboots', commandForm.configModemReboots)
      addString('ota_primary_url', commandForm.configOtaPrimaryUrl)
      addString('ota_fallback_url', commandForm.configOtaFallbackUrl)
      addString('ota_md5', commandForm.configOtaMd5)

      if (Object.keys(payload).length === 0) {
        setCommandError('Veuillez renseigner au moins un champ de configuration')
        return
      }
    } else if (commandForm.command === 'UPDATE_CALIBRATION') {
      if (commandForm.calA0 === '' || commandForm.calA1 === '' || commandForm.calA2 === '') {
        setCommandError('Veuillez fournir les coefficients a0, a1 et a2')
        return
      }
      payload.a0 = Number(commandForm.calA0)
      payload.a1 = Number(commandForm.calA1)
      payload.a2 = Number(commandForm.calA2)
      if ([payload.a0, payload.a1, payload.a2].some((value) => Number.isNaN(value))) {
        setCommandError('Les coefficients doivent être numériques')
        return
      }
    } else if (commandForm.command === 'OTA_REQUEST') {
      payload.channel = commandForm.otaChannel
      const trimmedUrl = commandForm.otaUrl?.trim()
      if (trimmedUrl) {
        payload.url = trimmedUrl
      }
      const trimmedMd5 = commandForm.otaMd5?.trim()
      if (trimmedMd5) {
        payload.md5 = trimmedMd5
      }
    }

    const body = {
      command: commandForm.command,
      payload,
      priority: commandForm.priority,
      expires_in_seconds: Number(commandForm.expiresInMinutes) > 0 ? Number(commandForm.expiresInMinutes) * 60 : undefined,
    }

    try {
      setCreatingCommand(true)
      setCommandError(null)
      setCommandSuccess(null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${selectedDevice.sim_iccid}/commands`,
        {
          method: 'POST',
          body: JSON.stringify(body),
        },
        { requiresAuth: true }
      )
      setCommandSuccess('✅ Commande envoyée avec succès')
      // Réinitialiser le formulaire
      setCommandForm({
        command: 'SET_SLEEP_SECONDS',
        sleepSeconds: 300,
        message: '',
        priority: 'normal',
        expiresInMinutes: 60,
        configApn: '',
        configJwt: '',
        configIccid: '',
        configSerial: '',
        configSimPin: '',
        configSleepMinutes: '',
        configAirflowPasses: '',
        configAirflowSamples: '',
        configAirflowDelay: '',
        configWatchdogSeconds: '',
        configModemBootTimeout: '',
        configSimReadyTimeout: '',
        configNetworkAttachTimeout: '',
        configModemReboots: '',
        configOtaPrimaryUrl: '',
        configOtaFallbackUrl: '',
        configOtaMd5: '',
        calA0: '',
        calA1: '',
        calA2: '',
        otaUrl: '',
        otaChannel: 'primary',
        otaMd5: '',
      })
      setCommandRefreshTick(tick => tick + 1)
    } catch (err) {
      logger.error(err)
      setCommandError(err.message || 'Erreur lors de l\'envoi de la commande')
    } finally {
      setCreatingCommand(false)
    }
  }

  const handleAssign = (device) => {
    if (!device) return
    setAssignTargetDevice(device)
    setAssignForm({ patient_id: device.patient_id ? String(device.patient_id) : '' })
    setAssignError(null)
    setAssignModalOpen(true)
  }

  const closeAssignModal = () => {
    if (assignLoading) return
    setAssignModalOpen(false)
    setAssignTargetDevice(null)
    setAssignError(null)
    setAssignForm({ patient_id: '' })
  }

  const handleAssignSubmit = async (event) => {
    event.preventDefault()
    if (!assignTargetDevice) return
    
    // Vérifier si le patient a déjà un dispositif assigné
    const selectedPatientId = assignForm.patient_id === '' ? null : parseInt(assignForm.patient_id, 10)
    if (selectedPatientId) {
      const existingDevice = devices.find(d => 
        d.patient_id === selectedPatientId && d.id !== assignTargetDevice.id
      )
      
      if (existingDevice) {
        const patient = patients.find(p => p.id === selectedPatientId)
        const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'ce patient'
        const existingDeviceName = existingDevice.device_name || existingDevice.sim_iccid || 'un dispositif'
        
        const confirmed = window.confirm(
          `⚠️ Attention : ${patientName} a déjà un dispositif assigné (${existingDeviceName}).\n\n` +
          `Voulez-vous vraiment remplacer ce dispositif par ${assignTargetDevice.device_name || assignTargetDevice.sim_iccid} ?\n\n` +
          `Note : Un patient ne devrait normalement avoir qu'un seul dispositif.`
        )
        
        if (!confirmed) {
          return
        }
      }
    }
    
    setAssignLoading(true)
    setAssignError(null)
    try {
      const payload = {
        patient_id: selectedPatientId
      }
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${assignTargetDevice.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload)
        },
        { requiresAuth: true }
      )
      setAssignModalOpen(false)
      setAssignTargetDevice(null)
      setAssignForm({ patient_id: '' })
      await refetch()
      // Mettre à jour le modal si on visualise ce dispositif
      setSelectedDevice((prev) => {
        if (!prev || prev.id !== assignTargetDevice.id) return prev
        const next = { ...prev, patient_id: selectedPatientId }
        if (selectedPatientId) {
          const patient = patients.find(p => p.id === selectedPatientId)
          if (patient) {
            next.first_name = patient.first_name
            next.last_name = patient.last_name
          }
        } else {
          next.first_name = null
          next.last_name = null
        }
        return next
      })
      notifyDevicesUpdated()
    } catch (err) {
      setAssignError(err.message)
    } finally {
      setAssignLoading(false)
    }
  }


  const getStatusBadge = (device) => {
    if (!device.last_seen) return { label: 'Jamais vu', color: 'bg-gray-100 text-gray-700' }
    const hours = (Date.now() - new Date(device.last_seen).getTime()) / (1000 * 60 * 60)
    if (hours < 2) return { label: 'En ligne', color: 'bg-green-100 text-green-700' }
    if (hours < 6) return { label: 'Inactif', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Hors ligne', color: 'bg-red-100 text-red-700' }
  }

  const getBatteryBadge = (battery) => {
    if (battery === null || battery === undefined) return { label: 'N/A', color: 'text-gray-500' }
    // Convertir en nombre pour s'assurer que c'est un nombre valide
    const batteryNum = typeof battery === 'number' ? battery : parseFloat(battery)
    if (isNaN(batteryNum)) return { label: 'N/A', color: 'text-gray-500' }
    if (batteryNum < 20) return { label: `${batteryNum.toFixed(0)}%`, color: 'text-red-600 font-semibold' }
    if (batteryNum < 50) return { label: `${batteryNum.toFixed(0)}%`, color: 'text-amber-600' }
    return { label: `${batteryNum.toFixed(0)}%`, color: 'text-green-600' }
  }

  const getUsbStreamStatusBadge = () => {
    const map = {
      idle: { label: 'En attente', color: 'bg-gray-100 text-gray-700' },
      connecting: { label: 'Connexion...', color: 'bg-blue-100 text-blue-700' },
      waiting: { label: 'En attente de données', color: 'bg-amber-100 text-amber-700' },
      running: { label: 'Flux en direct', color: 'bg-green-100 text-green-700' },
      error: { label: 'Erreur', color: 'bg-red-100 text-red-700' }
    }
    return map[usbStreamStatus] || map.idle
  }

  const isAdmin = user?.role_name === 'admin'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">🔌 Dispositifs</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {allDevices.length} dispositif(s) total
            {usbVirtualDevice && ' (1 USB non enregistré)'}
          </p>
        </div>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

      {/* Carte */}
      {!loading && devices.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">🗺️ Carte des dispositifs</h2>
          </div>
          <div style={{ height: '400px', width: '100%', position: 'relative', zIndex: 1 }}>
            <LeafletMap
              devices={devices}
              focusDeviceId={focusDeviceId}
              onSelect={(device) => {
                const found = devices.find(d => d.id === device.id)
                if (found) handleShowDetails(found)
              }}
            />
          </div>
        </div>
      )}

      {/* Messages OTA */}
      {(otaError || otaMessage) && (
        <div className={`alert ${otaError ? 'alert-warning' : 'alert-success'}`}>
          {otaError || otaMessage}
        </div>
      )}

      {/* Filtres et sélection firmware */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'Tous' },
            { id: 'assigned', label: 'Assignés' },
            { id: 'unassigned', label: 'Non assignés' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setAssignmentFilter(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                assignmentFilter === tab.id
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-white dark:bg-[rgb(var(--night-surface))] text-gray-700 dark:text-[rgb(var(--night-text-primary))] border border-gray-200 dark:border-[rgb(var(--night-border))] hover:bg-gray-50 dark:hover:bg-[rgb(var(--night-surface-hover))]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="🔍 Rechercher par nom, patient, ou ICCID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full"
          />
        </div>


      </div>

    {(usbDetectionNotice || usbDetectionError) && (
      <div className="mt-4 space-y-2">
        {usbDetectionNotice && (
          <div className={`alert ${usbDetectionNotice.type === 'success' ? 'alert-success' : 'alert-info'} flex items-start justify-between gap-4`}>
            <div>
              {usbDetectionNotice.message}
              {usbDetectionNotice.type === 'info' && (
                <button
                  type="button"
                  className="text-primary-600 dark:text-primary-300 text-sm underline font-semibold ml-3"
                  onClick={detectUSBDevice}
                >
                  🔁 Relancer la détection USB
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => setUsbDetectionNotice(null)}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Fermer la notification USB"
            >
              ✕
            </button>
          </div>
        )}
        {usbDetectionError && (
          <div className="alert alert-warning flex items-center justify-between gap-4">
            <span>{usbDetectionError}</span>
            <button
              type="button"
              onClick={() => setUsbDetectionError(null)}
              className="text-gray-500 hover:text-gray-700"
              aria-label="Fermer l'alerte USB"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    )}

      {/* Messages d'erreur et de succès */}
      <ErrorMessage error={deleteError} onClose={() => setDeleteError(null)} />
      <SuccessMessage message={deleteSuccess} onClose={() => setDeleteSuccess(null)} />

      {/* Modal de suppression de dispositif */}
      <Modal
        isOpen={showDeleteModal}
        onClose={closeDeleteModal}
        title={deviceToDelete ? `🗑️ Supprimer le dispositif` : ''}
      >
        {deviceToDelete && (
          <>
            {deleteError && (
              <div className="alert alert-warning mb-4">
                {deleteError}
              </div>
            )}

            <div className="mb-4">
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                Êtes-vous sûr de vouloir supprimer le dispositif :
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <p className="font-medium text-primary">
                  {deviceToDelete.device_name || deviceToDelete.sim_iccid}
                </p>
                <p className="text-xs text-muted font-mono mt-1">
                  {deviceToDelete.sim_iccid}
                </p>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                ⚠️ Cette action est irréversible et supprimera toutes les mesures et alertes associées.
              </p>
              {deviceToDelete.patient_id && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-2 font-semibold">
                  ❌ Ce dispositif est assigné à un patient. Désassignez-le d&apos;abord avant de le supprimer.
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="btn-secondary"
                onClick={closeDeleteModal}
                disabled={deletingDevice === deviceToDelete.id}
              >
                Annuler
              </button>
              <button
                className="btn-primary bg-red-500 hover:bg-red-600"
                onClick={handleDeleteDevice}
                disabled={deletingDevice === deviceToDelete.id || deviceToDelete.patient_id}
                title={deviceToDelete.patient_id ? "Impossible de supprimer un dispositif assigné" : ""}
              >
                {deletingDevice === deviceToDelete.id ? '⏳ Suppression...' : '🗑️ Supprimer'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Tableau */}
      {loading ? (
        <div className="card animate-shimmer h-64"></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">Dispositif</th>
                <th className="text-left py-3 px-4">Patient</th>
                <th className="text-left py-3 px-4">Statut</th>
                <th className="text-left py-3 px-4">Batterie</th>
                <th className="text-left py-3 px-4">Dernier contact</th>
                <th className="text-left py-3 px-4">Firmware</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-gray-500">
                    Aucun dispositif trouvé
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device, i) => {
                  const status = getStatusBadge(device)
                  const battery = getBatteryBadge(device.last_battery)
                  const deviceFirmware = device.firmware_version || 'N/A'
                  
                  return (
                    <tr 
                      key={device.id} 
                      className="table-row cursor-pointer"
                      onClick={() => handleShowDetails(device)}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-primary">{device.device_name || 'Sans nom'}</p>
                            {usbConnectedDevice && usbConnectedDevice.id === device.id && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-xs font-medium animate-pulse">
                                🔌 USB
                              </span>
                            )}
                            {device.isVirtual && (
                              <span className="px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded text-xs font-medium animate-pulse">
                                🔌 USB - Non enregistré
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted font-mono">{device.sim_iccid}</p>
                          {device.isVirtual && (
                            <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                              ⚠️ Dispositif détecté mais non enregistré - Flash disponible
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {device.first_name ? (
                          <span className="badge badge-success text-xs">{device.first_name} {device.last_name}</span>
                        ) : (
                          <span className="badge bg-orange-100 text-orange-700 text-xs">Non assigné</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${status.color}`}>{status.label}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={battery.color}>{battery.label}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {device.last_seen 
                          ? new Date(device.last_seen).toLocaleString('fr-FR', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })
                          : 'Jamais'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm font-mono">{device.firmware_version || 'N/A'}</span>
                      </td>
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              openDeleteModal(device)
                            }}
                            disabled={deletingDevice === device.id || device.isVirtual}
                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title={device.isVirtual ? "Impossible de supprimer un dispositif virtuel USB" : "Supprimer le dispositif"}
                          >
                            <span className="text-lg">{deletingDevice === device.id ? '⏳' : '🗑️'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}


      {/* Modal Détails & Journal - accessible depuis tous les onglets */}
      {showDetailsModal && selectedDevice && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-white to-gray-50/80 dark:from-slate-800/95 dark:to-slate-800/80 rounded-2xl shadow-2xl w-full max-w-4xl h-[95vh] flex flex-col backdrop-blur-md border border-gray-200/50 dark:border-slate-700/50">
            <div className="flex-shrink-0 bg-gradient-to-r from-white/90 to-gray-50/50 dark:from-slate-800/90 dark:to-slate-800/70 border-b border-gray-200/80 dark:border-slate-700/50 p-6 flex items-center justify-between backdrop-blur-sm">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                  🔌 {selectedDevice.device_name || selectedDevice.sim_iccid}
                </h2>
                <p className="text-sm text-gray-500 dark:text-slate-400">ICCID: {selectedDevice.sim_iccid}</p>
              </div>
              <button
                className="text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-100 text-2xl transition-all duration-200"
                onClick={() => {
                  setShowDetailsModal(false)
                  setSelectedDevice(null)
                  setDeviceDetails(null)
                  setDeviceLogs([])
                  setDeviceAlerts([])
                  setDeviceMeasurements([])
                  setModalActiveTab('details')
                }}
              >
                ✖
              </button>
            </div>

            {/* Onglets du modal */}
            <div className="flex-shrink-0 border-b border-gray-200/80 dark:border-slate-700/50 px-6 bg-gradient-to-r from-transparent via-gray-50/30 to-transparent dark:via-slate-800/30">
              <nav className="flex gap-2">
                <button
                  onClick={() => setModalActiveTab('details')}
                  className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
                    modalActiveTab === 'details'
                      ? 'border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  📊 Détails
                </button>
                <button
                  onClick={() => setModalActiveTab('alerts')}
                  className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
                    modalActiveTab === 'alerts'
                      ? 'border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  🔔 Alertes ({deviceAlerts.length})
                </button>
                <button
                  onClick={() => setModalActiveTab('logs')}
                  className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
                    modalActiveTab === 'logs'
                      ? 'border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                      : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  📝 Journal ({deviceLogs.length})
                </button>
                {isSelectedDeviceUsbConnected() && (
                  <button
                    onClick={() => setModalActiveTab('usb-stream')}
                    className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
                      modalActiveTab === 'usb-stream'
                        ? 'border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    ⚡ Streaming USB
                  </button>
                )}
              </nav>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingDetails ? (
                <div className="animate-shimmer h-64"></div>
              ) : (
                <>
                  {modalActiveTab === 'details' && (
                    <>
                      {/* Informations */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="card">
                          <p className="text-sm text-gray-500">Statut</p>
                          <p className="font-semibold text-lg">{getStatusBadge(selectedDevice).label}</p>
                        </div>
                        <div className="card">
                          <p className="text-sm text-gray-500">Batterie</p>
                          <p className={`font-semibold text-lg ${getBatteryBadge(selectedDevice.last_battery).color}`}>
                            {getBatteryBadge(selectedDevice.last_battery).label}
                          </p>
                        </div>
                        <div className="card">
                          <p className="text-sm text-gray-500">Firmware</p>
                          <p className="font-semibold text-lg font-mono">{selectedDevice.firmware_version || 'N/A'}</p>
                        </div>
                        <div className="card">
                          <p className="text-sm text-gray-500">Patient</p>
                          {selectedDevice.first_name ? (
                            <p className="font-semibold text-lg">{selectedDevice.first_name} {selectedDevice.last_name}</p>
                          ) : (
                            <p className="font-semibold text-lg text-gray-400">Non assigné</p>
                          )}
                        </div>
                      </div>

                      {/* Historique - Graphiques */}
                      {deviceMeasurements.length > 0 && (
                        <div className="card">
                          <h3 className="text-lg font-semibold mb-4">📈 Historique (72h)</h3>
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-sm font-medium text-gray-600 mb-2">Débit</h4>
                              <div className="h-48">
                                <Chart data={deviceMeasurements} type="flowrate" />
                              </div>
                            </div>
                            <div>
                              <h4 className="text-sm font-medium text-gray-600 mb-2">Batterie</h4>
                              <div className="h-48">
                                <Chart data={deviceMeasurements.map(m => ({ ...m, last_battery: m.battery }))} type="battery" />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                    </>
                  )}

                  {modalActiveTab === 'alerts' && (
                    <div className="h-full flex flex-col">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">🔔 Alertes ({deviceAlerts.length})</h3>
                      {deviceAlerts.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Aucune alerte active pour ce dispositif</p>
                      ) : (
                        <div className="flex-1 space-y-3 overflow-y-auto">
                          {deviceAlerts.map((alert, i) => (
                            <AlertCard key={alert.id} alert={alert} delay={i * 0.03} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {modalActiveTab === 'logs' && (
                    <div className="h-full flex flex-col">
                      <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-gray-100">📝 Journal ({deviceLogs.length})</h3>
                      {deviceLogs.length === 0 ? (
                        <p className="text-gray-500 dark:text-gray-400 text-sm">Aucun log disponible</p>
                      ) : (
                        <div className="flex-1 space-y-2 overflow-y-auto">
                          {deviceLogs.map((log) => (
                            <div key={log.id} className="border border-gray-200/80 dark:border-slate-700/50 rounded-lg p-3 text-sm bg-gradient-to-br from-white to-gray-50/50 dark:from-slate-800/50 dark:to-slate-800/30 backdrop-blur-sm hover:shadow-md transition-all duration-200">
                              <div className="flex items-center justify-between mb-1">
                                <span className={`badge ${
                                  log.level === 'ERROR' ? 'badge-error' :
                                  log.level === 'WARN' ? 'badge-warning' :
                                  log.level === 'SUCCESS' ? 'badge-success' :
                                  'badge-info'
                                }`}>
                                  {log.level}
                                </span>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                  {new Date(log.timestamp).toLocaleString('fr-FR')}
                                </span>
                              </div>
                              <p className="font-medium text-gray-900 dark:text-gray-100">{log.event_type}</p>
                              <p className="text-gray-600 dark:text-gray-300 mt-1">{log.message}</p>
                              {log.details && (
                                <pre className="text-xs text-gray-500 dark:text-gray-400 mt-2 bg-gray-50 dark:bg-gray-900 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(log.details, null, 2)}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                {modalActiveTab === 'usb-stream' && isSelectedDeviceUsbConnected() && (
                  <div className="h-full flex flex-col space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">⚡ Streaming USB temps réel</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Toute la zone ci-dessous est dédiée aux logs USB en direct. Le streaming démarre dès qu&apos;un dispositif est autorisé.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getUsbStreamStatusBadge().color}`}>
                          {getUsbStreamStatusBadge().label}
                        </span>
                        {(usbStreamStatus === 'running' || usbStreamStatus === 'waiting') && (
                          <button
                            onClick={stopUsbStreaming}
                            disabled={!isSupported}
                            className="btn-secondary text-sm"
                          >
                            ⏹️ Arrêter
                          </button>
                        )}
                        {usbStreamStatus === 'idle' && (usbConnectedDevice || usbVirtualDevice) && (
                          <button
                            onClick={startUsbStreaming}
                            disabled={!isSupported || usbStreamStatus === 'connecting'}
                            className={`btn-primary text-sm ${(!isSupported || usbStreamStatus === 'connecting') ? 'opacity-60 cursor-not-allowed' : ''}`}
                          >
                            ▶️ Redémarrer
                          </button>
                        )}
                        {isAdmin && selectedDevice && !selectedDevice.isVirtual && !selectedDevice.patient_id && (
                          <button
                            onClick={() => handleAssign(selectedDevice)}
                            className="btn-secondary text-sm"
                          >
                            ➕ Assigner à un patient
                          </button>
                        )}
                      </div>
                    </div>

                    {selectedDevice?.isVirtual && (
                      <div className="alert alert-warning flex flex-wrap items-center justify-between gap-3">
                        <div>
                          Ce dispositif est en mode virtuel (non enregistré). Relancez la détection après avoir obtenu l&apos;ICCID/Serial ou flashé le firmware.
                        </div>
                        <button
                          onClick={detectUSBDevice}
                          className="btn-secondary btn-sm"
                        >
                          🔁 Relancer la détection
                        </button>
                      </div>
                    )}

                    {!isSupported && (
                      <div className="alert alert-warning">
                        Le navigateur utilisé ne supporte pas l&apos;API Web Serial. Utilisez Chrome ou Edge (desktop) pour accéder au streaming USB.
                      </div>
                    )}

                    {usbStreamError && (
                      <div className="alert alert-warning">
                        {usbStreamError}
                      </div>
                    )}

                    {usbPortInfo && (
                      <div className="mb-3 rounded-xl border border-gray-200/80 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 px-4 py-3 text-sm text-gray-700 dark:text-slate-200">
                        <p className="font-semibold text-primary-600 dark:text-primary-300">
                          Port USB détecté&nbsp;: {usbPortInfo.friendlyName || `USB ${usbPortInfo.vendorHex}:${usbPortInfo.productHex}`}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          VID {usbPortInfo.vendorHex} · PID {usbPortInfo.productHex}
                        </p>
                      </div>
                    )}

                    {isSupported && !usbConnectedDevice && !usbVirtualDevice && (
                      <div className="alert alert-info text-sm">
                        Connectez un dispositif USB et autorisez-le dans la popup du navigateur. Le streaming démarrera automatiquement.
                      </div>
                    )}

                    <div className="flex-1 rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-900 text-green-400 p-4 shadow-inner overflow-y-auto">
                      {usbStreamLogs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
                          <span className="text-4xl">📡</span>
                          <p className="font-medium">En attente de logs USB...</p>
                          <p className="text-xs text-gray-400">
                            Dès que le firmware envoie le flux USB, les journaux apparaissent ici automatiquement.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1 font-mono text-sm tracking-tight">
                          {usbStreamLogs.map((log) => (
                            <div key={log.id} className="whitespace-pre-wrap">
                              <span className="text-gray-500 pr-3">{new Date(log.timestamp).toLocaleTimeString('fr-FR')}</span>
                              <span className="text-green-300">{log.line}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Assignation */}
      {assignModalOpen && assignTargetDevice && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-white to-gray-50/80 dark:from-slate-800/95 dark:to-slate-800/80 rounded-xl shadow-2xl w-full max-w-xl p-6 space-y-4 animate-scale-in backdrop-blur-md border border-gray-200/50 dark:border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  {assignTargetDevice.patient_id ? 'Modifier l\'assignation' : 'Assigner le dispositif'}
                </h2>
                <p className="text-sm text-gray-500">
                  {assignTargetDevice.device_name || assignTargetDevice.sim_iccid}
                </p>
                {assignTargetDevice.first_name && (
                  <p className="text-xs text-amber-600 mt-1">
                    Actuellement assigné à : {assignTargetDevice.first_name} {assignTargetDevice.last_name}
                  </p>
                )}
              </div>
              <button className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" onClick={closeAssignModal} disabled={assignLoading}>
                ✕
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleAssignSubmit}>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 w-full">
                Patient
                <select
                  className="input mt-1"
                  value={assignForm.patient_id}
                  onChange={(e) => setAssignForm({ patient_id: e.target.value })}
                >
                  <option value="">— Désassigner (Aucun patient) —</option>
                  {patients.map(patient => (
                    <option key={patient.id} value={patient.id}>
                      {patient.last_name.toUpperCase()} {patient.first_name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Sélectionner &quot;Désassigner&quot; pour retirer le dispositif du patient actuel
                </p>
              </label>

              {assignError && (
                <div className="alert alert-error">
                  <strong>Erreur :</strong> {assignError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={closeAssignModal} disabled={assignLoading}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={assignLoading}>
                  {assignLoading ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Upload Firmware */}
      {showUploadFirmwareModal && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[100] flex items-center justify-center p-4 overflow-y-auto backdrop-blur-sm">
          <div className="bg-gradient-to-br from-white to-gray-50/80 dark:from-slate-800/95 dark:to-slate-800/80 rounded-xl shadow-2xl w-full max-w-2xl p-6 space-y-4 animate-scale-in my-8 backdrop-blur-md border border-gray-200/50 dark:border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">📤 Upload Firmware</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Téléverser un nouveau firmware pour les dispositifs OTT
                </p>
              </div>
              <button 
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" 
                onClick={() => {
                  setShowUploadFirmwareModal(false)
                  setFirmwareFile(null)
                  setFirmwareVersion('')
                  setFirmwareReleaseNotes('')
                  setFirmwareIsStable(false)
                  setFirmwareUploadError(null)
                  setFirmwareUploadSuccess(null)
                }}
                disabled={uploadingFirmware}
              >
                ✕
              </button>
            </div>

            {firmwareUploadError && (
              <div className="alert alert-warning">
                <strong>Erreur :</strong> {firmwareUploadError}
              </div>
            )}

            {firmwareUploadSuccess && (
              <div className="alert alert-success">
                {firmwareUploadSuccess}
              </div>
            )}

            <form onSubmit={async (e) => {
              e.preventDefault()
              
              if (!firmwareFile) {
                setFirmwareUploadError('Veuillez sélectionner un fichier firmware')
                return
              }

              if (!firmwareVersion.trim()) {
                setFirmwareUploadError('Veuillez saisir une version (ex: 1.0.0)')
                return
              }

              const versionRegex = /^\d+\.\d+\.\d+$/
              if (!versionRegex.test(firmwareVersion.trim())) {
                setFirmwareUploadError('Le format de version doit être X.Y.Z (ex: 1.0.0)')
                return
              }

              setUploadingFirmware(true)
              setFirmwareUploadError(null)
              setFirmwareUploadSuccess(null)

              try {
                const formData = new FormData()
                formData.append('firmware', firmwareFile)
                formData.append('version', firmwareVersion.trim())
                formData.append('release_notes', firmwareReleaseNotes.trim())
                formData.append('is_stable', firmwareIsStable ? 'true' : 'false')

                const token = localStorage.getItem('token')
                if (!token) {
                  throw new Error('Token d\'authentification manquant')
                }

                const response = await fetch(`${API_URL}/api.php/firmwares`, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${token}`
                  },
                  body: formData
                })

                const data = await response.json()

                if (!response.ok || !data.success) {
                  throw new Error(data.error || 'Erreur lors de l\'upload')
                }

                setFirmwareUploadSuccess(`✅ Firmware v${firmwareVersion} uploadé avec succès !`)
                setFirmwareFile(null)
                setFirmwareVersion('')
                setFirmwareReleaseNotes('')
                setFirmwareIsStable(false)
                const fileInput = document.getElementById('firmware-file-upload')
                if (fileInput) fileInput.value = ''
                
                // Recharger les firmwares
                await refetch()
                notifyDevicesUpdated()
                
                // Fermer le modal après 2 secondes
                setTimeout(() => {
                  setShowUploadFirmwareModal(false)
                  setFirmwareUploadSuccess(null)
                }, 2000)
              } catch (err) {
                logger.error('Erreur upload firmware:', err)
                setFirmwareUploadError(err.message || 'Erreur lors de l\'upload du firmware')
              } finally {
                setUploadingFirmware(false)
              }
            }} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Fichier firmware (.bin) *
                </label>
                <input
                  id="firmware-file-upload"
                  type="file"
                  accept=".bin"
                  onChange={(e) => {
                    const selectedFile = e.target.files[0]
                    if (selectedFile) {
                      if (!selectedFile.name.endsWith('.bin')) {
                        setFirmwareUploadError('Le fichier doit être un fichier .bin')
                        setFirmwareFile(null)
                        return
                      }
                      setFirmwareFile(selectedFile)
                      setFirmwareUploadError(null)
                    }
                  }}
                  disabled={uploadingFirmware}
                  className="input"
                  required
                />
                {firmwareFile && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    📄 {firmwareFile.name} ({(firmwareFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Sélectionnez le fichier firmware compilé (.bin) à uploader
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Version (X.Y.Z) *
                </label>
                <input
                  type="text"
                  value={firmwareVersion}
                  onChange={(e) => setFirmwareVersion(e.target.value)}
                  placeholder="1.0.0"
                  disabled={uploadingFirmware}
                  className="input"
                  required
                  pattern="^\d+\.\d+\.\d+$"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Format: X.Y.Z (ex: 1.0.0, 2.1.3)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notes de version (optionnel)
                </label>
                <textarea
                  value={firmwareReleaseNotes}
                  onChange={(e) => setFirmwareReleaseNotes(e.target.value)}
                  placeholder="Corrections de bugs, nouvelles fonctionnalités..."
                  disabled={uploadingFirmware}
                  className="input min-h-[100px]"
                  rows={4}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Description des changements apportés dans cette version
                </p>
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="firmware-is-stable"
                  checked={firmwareIsStable}
                  onChange={(e) => setFirmwareIsStable(e.target.checked)}
                  disabled={uploadingFirmware}
                  className="h-4 w-4 text-primary-600 dark:text-primary-400 rounded focus:ring-primary-500"
                />
                <label htmlFor="firmware-is-stable" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Version stable
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  (Coché = stable, décoché = beta)
                </span>
              </div>

              <div className="bg-gradient-to-r from-amber-50 to-amber-50/50 dark:from-amber-900/20 dark:to-amber-900/10 border-l-4 border-amber-500 dark:border-amber-400 p-4 rounded backdrop-blur-sm">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ Attention</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Assurez-vous que le firmware est compatible avec les dispositifs OTT avant de l&apos;uploader. 
                  Un firmware incompatible peut planter les dispositifs de manière irréversible.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setShowUploadFirmwareModal(false)
                    setFirmwareFile(null)
                    setFirmwareVersion('')
                    setFirmwareReleaseNotes('')
                    setFirmwareIsStable(false)
                    setFirmwareUploadError(null)
                    setFirmwareUploadSuccess(null)
                  }}
                  disabled={uploadingFirmware}
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={uploadingFirmware || !firmwareFile || !firmwareVersion.trim()}
                  className="btn-primary"
                >
                  {uploadingFirmware ? '⏳ Upload en cours...' : '📤 Uploader le firmware'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
