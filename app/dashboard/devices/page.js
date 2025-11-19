'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import AlertCard from '@/components/AlertCard'
import FlashUSBModal from '@/components/FlashUSBModal'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import { useSerialPort } from '@/components/SerialPortManager'
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
  
  // Détection du port série USB (COM3)
  const { port, isConnected, isSupported, requestPort, connect, disconnect, startReading, write } = useSerialPort()
  const [usbConnectedDevice, setUsbConnectedDevice] = useState(null)
  const [usbVirtualDevice, setUsbVirtualDevice] = useState(null) // Dispositif virtuel si non trouvé en base
  const [checkingUSB, setCheckingUSB] = useState(false)
  const [usbPortInfo, setUsbPortInfo] = useState(null)
  const [autoDetecting, setAutoDetecting] = useState(true)
  const [usbStreamStatus, setUsbStreamStatus] = useState('idle') // idle | connecting | waiting | running
  const [usbStreamMeasurements, setUsbStreamMeasurements] = useState([])
  const [usbStreamLogs, setUsbStreamLogs] = useState([])
  const [usbStreamError, setUsbStreamError] = useState(null)
  const [usbStreamLastMeasurement, setUsbStreamLastMeasurement] = useState(null)
  const [usbStreamLastUpdate, setUsbStreamLastUpdate] = useState(null)
  const usbStreamStopRef = useRef(null)
  const usbStreamBufferRef = useRef('')
  
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
  
  // Modal Flash USB
  const [showFlashUSBModal, setShowFlashUSBModal] = useState(false)
  const [deviceForFlash, setDeviceForFlash] = useState(null)
  
  // Modal Upload Firmware
  const [showUploadFirmwareModal, setShowUploadFirmwareModal] = useState(false)
  const [firmwareFile, setFirmwareFile] = useState(null)
  const [firmwareVersion, setFirmwareVersion] = useState('')
  const [firmwareReleaseNotes, setFirmwareReleaseNotes] = useState('')
  const [firmwareIsStable, setFirmwareIsStable] = useState(false)
  const [uploadingFirmware, setUploadingFirmware] = useState(false)
  const [firmwareUploadError, setFirmwareUploadError] = useState(null)
  const [firmwareUploadSuccess, setFirmwareUploadSuccess] = useState(null)
  
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
  const [assignForm, setAssignForm] = useState({ patient_id: '' })
  const [assignError, setAssignError] = useState(null)
  const [assignLoading, setAssignLoading] = useState(false)
  
  // OTA intégré dans le tableau
  const [selectedFirmwareVersion, setSelectedFirmwareVersion] = useState('')
  const [otaDeploying, setOtaDeploying] = useState({})
  const [otaMessage, setOtaMessage] = useState(null)
  const [otaError, setOtaError] = useState(null)
  
  // Focus sur la carte
  const [focusDeviceId, setFocusDeviceId] = useState(null)
  
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
      const portInfo = targetPort.getInfo()
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
        
        // Log en temps réel pour debug (limité pour éviter le spam)
        if (receivedData.length % 100 === 0) {
          logger.debug('📥 Données reçues:', receivedData.length, 'caractères')
        }
        
        // ICCID - plusieurs formats possibles
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
        if (iccidMatch && iccidMatch[1]) {
          const newIccid = iccidMatch[1].trim()
          // Vérifier que c'est un ICCID valide (19-20 chiffres)
          if (newIccid.length >= 19 && newIccid.length <= 20 && /^\d+$/.test(newIccid)) {
            iccid = newIccid
            logger.log('✅ ICCID détecté:', iccid)
          }
        }
        
        // Serial - plusieurs formats
        const serialMatch = receivedData.match(/SERIAL[:\s=]+([A-Z0-9\-]+)/i) || 
                           receivedData.match(/IMEI[:\s=]+([A-Z0-9]+)/i) ||
                           receivedData.match(/["']serial["'][:\s]+["']?([A-Z0-9\-]+)["']?/i)
        if (serialMatch && serialMatch[1]) {
          deviceSerial = serialMatch[1].trim()
          logger.log('✅ Serial détecté:', deviceSerial)
        }
        
        // Firmware version - plusieurs formats
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
      })

      // Attendre un peu que la connexion soit stable
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Envoyer les commandes AT pour obtenir les infos
      logger.log('📤 Envoi des commandes AT...')
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
      
      // Continuer à écouter pendant 5 secondes supplémentaires pour capturer les données en continu
      // (le firmware peut envoyer des mesures en continu)
      logger.log('👂 Écoute continue des données série (5 secondes)...')
      await new Promise(resolve => setTimeout(resolve, 5000))
      
      // Vérifier si de nouvelles données arrivent encore
      const checkInterval = setInterval(() => {
        const timeSinceLastData = Date.now() - lastDataUpdate
        if (timeSinceLastData > 2000) {
          // Pas de nouvelles données depuis 2 secondes, on peut arrêter
          clearInterval(checkInterval)
        }
      }, 500)
      
      // Attendre encore 2 secondes pour être sûr d'avoir toutes les données
      await new Promise(resolve => setTimeout(resolve, 2000))
      clearInterval(checkInterval)

      if (stopReading) stopReading()

      // Log des données brutes reçues (premiers 1000 caractères pour debug)
      logger.log('📥 Données brutes reçues (' + receivedData.length + ' caractères):')
      logger.log(receivedData.substring(0, 1000))
      if (receivedData.length > 1000) {
        logger.log('... (tronqué, ' + (receivedData.length - 1000) + ' caractères supplémentaires)')
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

      // Chercher dans la base
      let foundDevice = null
      if (iccid) {
        foundDevice = devices.find(d => d.sim_iccid && d.sim_iccid.includes(iccid))
        if (foundDevice) {
          logger.log('✅ Dispositif trouvé par ICCID:', foundDevice.device_name || foundDevice.sim_iccid)
        }
      }
      if (!foundDevice && deviceSerial) {
        foundDevice = devices.find(d => d.device_serial && d.device_serial.includes(deviceSerial))
        if (foundDevice) {
          logger.log('✅ Dispositif trouvé par Serial:', foundDevice.device_name || foundDevice.device_serial)
        }
      }

      if (foundDevice) {
        setUsbConnectedDevice(foundDevice)
        setUsbVirtualDevice(null)
        logger.log('🔌 Dispositif USB connecté (enregistré):', foundDevice.device_name || foundDevice.sim_iccid)
        return foundDevice
      } else {
        // Créer le dispositif dans la base de données pour qu'il soit assignable
        const deviceIdentifier = iccid && iccid !== 'N/A' && iccid.length >= 10 ? iccid.slice(-4) : 
                                deviceSerial && deviceSerial !== 'N/A' ? deviceSerial.slice(-4) : 
                                portInfo.usbVendorId && portInfo.usbProductId ? 
                                  `${portInfo.usbVendorId.toString(16)}:${portInfo.usbProductId.toString(16)}` : 
                                  'UNKNOWN'
        
        const deviceName = `USB-${deviceIdentifier}`
        const simIccid = (iccid && iccid !== 'N/A' && iccid.length >= 10) ? iccid : null
        
        try {
          logger.log('📝 Création du dispositif USB dans la base de données...')
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
            // Recharger les dispositifs pour mettre à jour la liste
            await refetch()
            notifyDevicesUpdated()
            return createdDevice.device
          }
        } catch (createErr) {
          // Si la création échoue (dispositif déjà existant par exemple), essayer de le retrouver
          if (createErr.error && createErr.error.includes('déjà utilisé')) {
            logger.log('⚠️ Dispositif déjà existant, recherche en cours...')
            // Recharger et chercher à nouveau
            await refetch()
            const devicesResponse = await fetchJson(
              fetchWithAuth,
              API_URL,
              '/api.php/devices',
              { method: 'GET' },
              { requiresAuth: true }
            )
            const allDevicesFromApi = devicesResponse.devices || []
            const existingDevice = allDevicesFromApi.find(d => 
              (simIccid && d.sim_iccid && d.sim_iccid.includes(simIccid)) ||
              (deviceSerial && d.device_serial && d.device_serial.includes(deviceSerial)) ||
              (d.device_name && d.device_name.includes(deviceIdentifier))
            )
            if (existingDevice) {
              logger.log('✅ Dispositif existant trouvé:', existingDevice.device_name || existingDevice.sim_iccid)
              setUsbConnectedDevice(existingDevice)
              setUsbVirtualDevice(null)
              await refetch()
              notifyDevicesUpdated()
              return existingDevice
            }
          }
          logger.warn('⚠️ Erreur création dispositif USB en base:', createErr)
          // Si la création échoue, créer un dispositif virtuel temporaire
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
          logger.log('🔌 Dispositif USB virtuel créé (non enregistré):', virtualDevice.device_name)
          logger.log('   ⚠️ Ce dispositif virtuel ne peut pas être assigné à un patient')
          return virtualDevice
        }
      }
    } catch (err) {
      logger.error('Erreur détection dispositif:', err)
      return null
    }
  }, [connect, startReading, write, devices, fetchWithAuth, API_URL, refetch, notifyDevicesUpdated])

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
  }, [isSupported, requestPort, detectDeviceOnPort])

  const appendUsbStreamLog = useCallback((line) => {
    if (!line) return
    setUsbStreamLogs(prev => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, line, timestamp: Date.now() }]
      return next.slice(-80)
    })
  }, [])

  const ensurePortReady = useCallback(async () => {
    if (!isSupported) {
      throw new Error('Web Serial API non supportée par ce navigateur')
    }

    if (port && isConnected) return port

    if (port && !isConnected) {
      const reconnected = await connect(port, 115200)
      if (reconnected) return port
    }

    const selectedPort = await requestPort()
    if (!selectedPort) {
      throw new Error('Aucun port USB sélectionné')
    }

    const connected = await connect(selectedPort, 115200)
    if (!connected) {
      throw new Error('Impossible de se connecter au port USB sélectionné')
    }

    return selectedPort
  }, [connect, isConnected, isSupported, port, requestPort])

  const processUsbStreamLine = useCallback((line) => {
    if (!line) return
    const trimmed = line.trim()
    if (!trimmed) return

    if (trimmed.startsWith('{') && trimmed.includes('"mode"')) {
      try {
        const payload = JSON.parse(trimmed)
        if (payload.mode === 'usb_stream') {
          const measurement = {
            id: `usb-${payload.seq ?? Date.now()}`,
            seq: payload.seq ?? null,
            timestamp: Date.now(),
            flowrate: payload.flow_lpm ?? payload.flowrate ?? payload.flow ?? null,
            battery: payload.battery_percent ?? payload.battery ?? null,
            rssi: payload.rssi ?? null,
            interval: payload.interval_ms ?? payload.interval ?? null,
            raw: payload,
          }

          setUsbStreamMeasurements(prev => {
            const next = [...prev, measurement]
            return next.slice(-120)
          })
          setUsbStreamLastMeasurement(measurement)
          setUsbStreamLastUpdate(Date.now())
          setUsbStreamError(null)
          setUsbStreamStatus('running')
          return
        }
      } catch (err) {
        appendUsbStreamLog(`⚠️ JSON invalide: ${trimmed}`)
        return
      }
    }

    appendUsbStreamLog(trimmed)
  }, [appendUsbStreamLog])

  const handleUsbStreamChunk = useCallback((chunk) => {
    usbStreamBufferRef.current += chunk
    const parts = usbStreamBufferRef.current.split(/\r?\n/)
    usbStreamBufferRef.current = parts.pop() ?? ''
    parts.forEach(line => processUsbStreamLine(line))
  }, [processUsbStreamLine])

  const stopUsbStreaming = useCallback(() => {
    if (usbStreamStopRef.current) {
      usbStreamStopRef.current()
      usbStreamStopRef.current = null
    }
    setUsbStreamStatus('idle')
  }, [])

  const startUsbStreaming = useCallback(async () => {
    try {
      setUsbStreamError(null)
      setUsbStreamStatus('connecting')
      await ensurePortReady()

      if (usbStreamStopRef.current) {
        usbStreamStopRef.current()
        usbStreamStopRef.current = null
      }

      usbStreamBufferRef.current = ''
      setUsbStreamMeasurements([])
      setUsbStreamLogs([])
      setUsbStreamLastMeasurement(null)
      setUsbStreamLastUpdate(null)

      const stop = await startReading(handleUsbStreamChunk)
      usbStreamStopRef.current = stop
      setUsbStreamStatus('waiting')
    } catch (err) {
      setUsbStreamError(err.message || 'Impossible de démarrer le streaming USB')
      setUsbStreamStatus('idle')
    }
  }, [ensurePortReady, handleUsbStreamChunk, startReading])

  // Déconnecter le port USB
  const disconnectUSB = useCallback(async () => {
    await disconnect()
    stopUsbStreaming()
    setUsbConnectedDevice(null)
    setUsbVirtualDevice(null)
    setUsbPortInfo(null)
  }, [disconnect, stopUsbStreaming])

  // Détection automatique au chargement et au retour sur la page (ports déjà autorisés)
  useEffect(() => {
    // Réactiver la détection quand on revient sur la page (si pas de dispositif déjà connecté)
    if (isSupported && !autoDetecting && !usbConnectedDevice && !usbVirtualDevice && !loading) {
      logger.log('🔄 Réactivation de la détection automatique USB...')
      setAutoDetecting(true)
    }
    
    if (!isSupported) {
      logger.debug('Web Serial API non supporté')
      setAutoDetecting(false)
      return
    }

    if (!autoDetecting) return

    const autoDetect = async () => {
      try {
        logger.log('🔍 Détection automatique USB en cours...')
        
        // Récupérer les ports déjà autorisés (sans interaction utilisateur)
        const ports = await navigator.serial.getPorts()
        logger.log(`📡 Ports trouvés: ${ports.length}`)
        
        if (ports.length === 0) {
          logger.debug('Aucun port série autorisé trouvé - la détection automatique nécessite une première autorisation manuelle')
          logger.log('💡 Pour autoriser un port USB la première fois, connectez votre dispositif et autorisez-le dans la popup du navigateur')
          setAutoDetecting(false)
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
                return // Arrêter au premier dispositif trouvé
              } else {
                logger.debug('Aucun dispositif détecté sur ce port')
              }
            }
          } catch (portErr) {
            logger.warn('Erreur sur un port:', portErr.message)
            // Continuer avec le port suivant
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
              return
            }
          }
        }
        
        logger.debug('Aucun dispositif détecté sur les ports disponibles')
      } catch (err) {
        logger.error('Erreur détection automatique USB:', err)
      } finally {
        setAutoDetecting(false)
      }
    }

    // Attendre que les devices soient chargés, puis détecter
    // Délai réduit pour détection plus rapide
    const timer = setTimeout(() => {
      if (devices.length > 0 || !loading) {
        autoDetect()
      } else {
        // Si toujours en chargement après 1s, essayer quand même
        setTimeout(() => autoDetect(), 1000)
      }
    }, 500) // Délai réduit pour détection plus rapide

    return () => clearTimeout(timer)
  }, [isSupported, autoDetecting, detectDeviceOnPort, usbConnectedDevice, usbVirtualDevice, devices, loading, refetch])

  // Écouter les nouveaux ports connectés (événement navigateur)
  useEffect(() => {
    if (!isSupported) return

    const handleConnect = async (event) => {
      try {
        logger.log('🔌 Nouveau port USB connecté détecté par le navigateur')
        // Le port est dans event.target
        if (event.target) {
          logger.log('📱 Tentative de détection automatique sur le nouveau port...')
          const device = await detectDeviceOnPort(event.target)
          if (device) {
            logger.log('✅ Dispositif détecté sur le nouveau port:', device.device_name || device.sim_iccid)
            setAutoDetecting(false)
          }
        }
      } catch (err) {
        logger.error('Erreur lors de la détection du nouveau port:', err)
      }
    }

    // Écouter l'événement 'connect' du navigateur
    if (navigator.serial && typeof navigator.serial.addEventListener === 'function') {
      navigator.serial.addEventListener('connect', handleConnect)
      logger.log('👂 Écoute des événements de connexion USB activée')
    }

    return () => {
      if (navigator.serial && typeof navigator.serial.removeEventListener === 'function') {
        navigator.serial.removeEventListener('connect', handleConnect)
      }
    }
  }, [isSupported, detectDeviceOnPort])

  // Vérifier si un dispositif peut recevoir une mise à jour OTA
  const canReceiveOTA = useCallback((device) => {
    // Dispositif virtuel USB ne peut pas recevoir OTA (seulement USB)
    if (device.isVirtual) {
      return { can: false, reason: 'Dispositif USB virtuel - utilisez le flash USB' }
    }
    
    // Vérifier si OTA déjà en cours
    if (device.ota_pending) {
      return { 
        can: false, 
        reason: `Mise à jour OTA déjà en cours (v${device.target_firmware_version || 'N/A'})` 
      }
    }
    
    // Vérifier si le dispositif est hors ligne
    if (!device.last_seen) {
      return { can: false, reason: 'Dispositif jamais vu en ligne' }
    }
    
    const hoursSinceLastSeen = (Date.now() - new Date(device.last_seen).getTime()) / (1000 * 60 * 60)
    if (hoursSinceLastSeen > 6) {
      return { 
        can: false, 
        reason: `Dispositif hors ligne depuis ${Math.round(hoursSinceLastSeen * 10) / 10}h (max: 6h)` 
      }
    }
    
    // Vérifier la batterie
    if (device.last_battery !== null && device.last_battery !== undefined) {
      const battery = typeof device.last_battery === 'number' ? device.last_battery : parseFloat(device.last_battery)
      if (!isNaN(battery) && battery < 20) {
        return { 
          can: false, 
          reason: `Batterie trop faible (${Math.round(battery)}%) - minimum requis: 20%` 
        }
      }
    }
    
    return { can: true }
  }, [])

  // Fonction pour déclencher OTA sur un dispositif
  const handleOTA = async (device, e) => {
    e.stopPropagation() // Empêcher l'ouverture du modal
    if (!selectedFirmwareVersion) {
      setOtaError('Veuillez sélectionner un firmware')
      return
    }

    // Vérifier les conditions avant d'envoyer la requête
    const check = canReceiveOTA(device)
    if (!check.can) {
      setOtaError(`❌ ${check.reason}`)
      return
    }

    try {
      setOtaError(null)
      setOtaMessage(null)
      setOtaDeploying(prev => ({ ...prev, [device.id]: true }))
      
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}/ota`,
        {
          method: 'POST',
          body: JSON.stringify({ firmware_version: selectedFirmwareVersion })
        },
        { requiresAuth: true }
      )
      
      setOtaMessage(`✅ OTA v${selectedFirmwareVersion} programmé pour ${device.device_name || device.sim_iccid}`)
      
      // Recharger les dispositifs
      await refetch()
      notifyDevicesUpdated()
      notifyDevicesUpdated()
    } catch (err) {
      // Extraire le message d'erreur de la réponse API si disponible
      const errorMessage = err.message || 'Erreur lors du déploiement OTA'
      setOtaError(`❌ ${errorMessage}`)
    } finally {
      setOtaDeploying(prev => {
        const next = { ...prev }
        delete next[device.id]
        return next
      })
    }
  }

  // Fonction pour flasher tous les dispositifs concernés
  const handleOTAAll = async (e) => {
    e.stopPropagation()
    if (!selectedFirmwareVersion || devicesToUpdate.length === 0) return

    // Filtrer les dispositifs qui peuvent recevoir OTA
    const eligibleDevices = devicesToUpdate.filter(d => canReceiveOTA(d).can)
    const ineligibleDevices = devicesToUpdate.filter(d => !canReceiveOTA(d).can)
    
    if (eligibleDevices.length === 0) {
      const reasons = [...new Set(ineligibleDevices.map(d => canReceiveOTA(d).reason))]
      setOtaError(`❌ Aucun dispositif éligible pour OTA. Raisons: ${reasons.join('; ')}`)
      return
    }

    let confirmMessage = `⚠️ ATTENTION : Déploiement massif OTA\n\n` +
      `Firmware: v${selectedFirmwareVersion}\n` +
      `Dispositifs éligibles: ${eligibleDevices.length} / ${devicesToUpdate.length}\n\n`
    
    if (ineligibleDevices.length > 0) {
      confirmMessage += `⚠️ ${ineligibleDevices.length} dispositif(s) seront ignorés (hors ligne, batterie faible, OTA en cours, etc.)\n\n`
    }
    
    confirmMessage += `Cette opération va déployer le firmware sur ${eligibleDevices.length} dispositif(s) éligible(s).\n` +
      `Cela peut planter les dispositifs si le firmware est incompatible.\n\n` +
      `Êtes-vous sûr de vouloir continuer ?`

    if (!confirm(confirmMessage)) return

    setOtaError(null)
    setOtaMessage(null)
    const eligibleDeviceIds = eligibleDevices.map(d => d.id)
    
    // Marquer tous les éligibles comme en cours de déploiement
    const deployingState = {}
    eligibleDeviceIds.forEach(id => { deployingState[id] = true })
    setOtaDeploying(deployingState)

    let successCount = 0
    let errorCount = 0
    let skippedCount = ineligibleDevices.length

    try {
      // Déployer sur tous les dispositifs éligibles en parallèle
      const promises = eligibleDeviceIds.map(async (deviceId) => {
        try {
          await fetchJson(
            fetchWithAuth,
            API_URL,
            `/api.php/devices/${deviceId}/ota`,
            {
              method: 'POST',
              body: JSON.stringify({ firmware_version: selectedFirmwareVersion })
            },
            { requiresAuth: true }
          )
          successCount++
        } catch (err) {
          errorCount++
          logger.error(`Erreur OTA pour dispositif ${deviceId}:`, err)
        }
      })

      await Promise.all(promises)

      let message = `✅ OTA v${selectedFirmwareVersion} programmé : ${successCount} succès`
      if (errorCount > 0) {
        message += `, ${errorCount} erreur(s)`
      }
      if (skippedCount > 0) {
        message += `, ${skippedCount} ignoré(s) (hors ligne/batterie faible/OTA en cours)`
      }
      if (errorCount === 0) {
        setOtaMessage(message)
      } else {
        setOtaError(message)
      }

      // Recharger les dispositifs
      await refetch()
    } catch (err) {
      setOtaError(`Erreur lors du déploiement massif: ${err.message}`)
    } finally {
      // Réinitialiser l'état de déploiement
      setOtaDeploying({})
    }
  }

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
  const allDevices = useMemo(() => {
    const realDevices = [...devices]
    // Ajouter le dispositif virtuel USB s'il existe et n'est pas déjà dans la liste
    if (usbVirtualDevice && !realDevices.find(d => d.id === usbVirtualDevice.id)) {
      realDevices.push(usbVirtualDevice)
    }
    return realDevices
  }, [devices, usbVirtualDevice])

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
  const devicesToUpdate = useMemo(() => {
    if (!selectedFirmwareVersion) return []
    return filteredDevices.filter(device => {
      // Les dispositifs virtuels peuvent toujours être mis à jour
      if (device.isVirtual) return true
      const deviceFirmware = device.firmware_version || 'N/A'
      // Si firmware est N/A ou différent, on peut le mettre à jour
      if (deviceFirmware === 'N/A' || deviceFirmware === 'n/a') return true
      return deviceFirmware !== selectedFirmwareVersion
    })
  }, [filteredDevices, selectedFirmwareVersion])

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
    setSelectedDevice(device)
    setAssignForm({ patient_id: device.patient_id ? String(device.patient_id) : '' })
    setAssignError(null)
    setAssignModalOpen(true)
  }

  const closeAssignModal = () => {
    if (assignLoading) return
    setAssignModalOpen(false)
    setSelectedDevice(null)
    setAssignError(null)
  }

  const handleAssignSubmit = async (event) => {
    event.preventDefault()
    if (!selectedDevice) return
    
    // Vérifier si le patient a déjà un dispositif assigné
    const selectedPatientId = assignForm.patient_id === '' ? null : parseInt(assignForm.patient_id, 10)
    if (selectedPatientId) {
      const existingDevice = devices.find(d => 
        d.patient_id === selectedPatientId && d.id !== selectedDevice.id
      )
      
      if (existingDevice) {
        const patient = patients.find(p => p.id === selectedPatientId)
        const patientName = patient ? `${patient.first_name} ${patient.last_name}` : 'ce patient'
        const existingDeviceName = existingDevice.device_name || existingDevice.sim_iccid || 'un dispositif'
        
        const confirmed = window.confirm(
          `⚠️ Attention : ${patientName} a déjà un dispositif assigné (${existingDeviceName}).\n\n` +
          `Voulez-vous vraiment remplacer ce dispositif par ${selectedDevice.device_name || selectedDevice.sim_iccid} ?\n\n` +
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
        `/api.php/devices/${selectedDevice.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload)
        },
        { requiresAuth: true }
      )
      setAssignModalOpen(false)
      setSelectedDevice(null)
      setAssignForm({ patient_id: '' })
      await refetch()
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
        {isConnected && (
          <span className="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-lg text-sm font-medium">
            🔌 USB Connecté
            {usbConnectedDevice && ` - ${usbConnectedDevice.device_name || usbConnectedDevice.sim_iccid}`}
            {usbVirtualDevice && ` - ${usbVirtualDevice.device_name} (Non enregistré)`}
          </span>
        )}
      </div>

      {/* Streaming USB */}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">⚡ Streaming USB temps réel</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-2xl">
              Branchez l’OTT en USB, ouvrez un moniteur série (115200&nbsp;bauds), puis tapez <code className="px-1 bg-gray-100 rounded text-xs">usb</code> + Entrée dans les 3&nbsp;secondes suivant le boot pour activer le mode streaming.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getUsbStreamStatusBadge().color}`}>
              {getUsbStreamStatusBadge().label}
            </span>
            <button
              onClick={() => (usbStreamStatus === 'running' || usbStreamStatus === 'waiting') ? stopUsbStreaming() : startUsbStreaming()}
              disabled={!isSupported || usbStreamStatus === 'connecting'}
              className={`btn-primary text-sm ${( !isSupported ) ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {(usbStreamStatus === 'running' || usbStreamStatus === 'waiting') ? '⏹️ Arrêter' : '▶️ Écouter'}
            </button>
            <button
              onClick={detectUSBDevice}
              className="btn-secondary text-sm"
              disabled={checkingUSB || !isSupported}
            >
              {checkingUSB ? '⏳ Scan...' : '🔍 Détecter'}
            </button>
          </div>
        </div>

        {!isSupported && (
          <div className="alert alert-warning">
            Le navigateur utilisé ne supporte pas l’API Web Serial. Utilisez Chrome ou Edge (desktop) pour accéder au streaming USB.
          </div>
        )}

        {usbStreamError && (
          <div className="alert alert-warning">
            {usbStreamError}
          </div>
        )}

        {isSupported && usbStreamStatus === 'idle' && (
          <div className="alert alert-info text-sm">
            1) Appuyez sur <strong>Reset</strong> sur le boîtier → 2) Tapez <code className="px-1 bg-gray-100 rounded text-xs">usb</code> + Entrée sur le terminal → 3) Cliquez sur «&nbsp;Écouter&nbsp;» pour afficher les mesures en continu.
          </div>
        )}

        {isSupported && (
          <>
            {usbStreamMeasurements.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-gray-200 dark:border-slate-700 p-4 bg-gray-50 dark:bg-slate-900/30">
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">Dernière mesure</h3>
                  {usbStreamLastMeasurement ? (
                    <div className="space-y-2 text-gray-900 dark:text-gray-100">
                      <p className="text-3xl font-bold">
                        {usbStreamLastMeasurement.flowrate !== null && usbStreamLastMeasurement.flowrate !== undefined
                          ? `${Number(usbStreamLastMeasurement.flowrate).toFixed(2)} L/min`
                          : '—'}
                      </p>
                      <p className="text-sm">
                        Batterie&nbsp;: {usbStreamLastMeasurement.battery !== null && usbStreamLastMeasurement.battery !== undefined
                          ? `${Number(usbStreamLastMeasurement.battery).toFixed(1)}%`
                          : 'N/A'}
                      </p>
                      <p className="text-sm">RSSI : {usbStreamLastMeasurement.rssi ?? 'N/A'} dBm</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Seq #{usbStreamLastMeasurement.seq ?? '—'} • Intervalle {usbStreamLastMeasurement.interval ?? '?'} ms
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Reçu à {new Date(usbStreamLastMeasurement.timestamp).toLocaleTimeString('fr-FR')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">En attente d’une première mesure...</p>
                  )}
                </div>

                <div className="rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Débit instantané</h3>
                  <Chart data={usbStreamMeasurements.map(m => ({ ...m, flowrate: m.flowrate, timestamp: m.timestamp }))} type="flowrate" />
                </div>

                <div className="rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
                  <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Batterie instantanée</h3>
                  <Chart data={usbStreamMeasurements.map(m => ({ ...m, battery: m.battery, timestamp: m.timestamp }))} type="battery" />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-gray-300 dark:border-slate-700 p-4 text-sm text-gray-600 dark:text-gray-300">
                En attente d’un JSON <code className="px-1 bg-gray-100 rounded text-xs">{"{ \"mode\":\"usb_stream\", ... }"}</code>. Assurez-vous d’avoir activé le mode USB côté firmware puis cliquez sur «&nbsp;Écouter&nbsp;».
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Dernières mesures</h3>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 dark:text-gray-400">
                        <th className="py-1">Heure</th>
                        <th className="py-1">Débit</th>
                        <th className="py-1">Batterie</th>
                        <th className="py-1">RSSI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usbStreamMeasurements.slice(-8).reverse().map(entry => (
                        <tr key={entry.id} className="border-t border-gray-100 dark:border-slate-800">
                          <td className="py-1 font-mono text-xs">{new Date(entry.timestamp).toLocaleTimeString('fr-FR')}</td>
                          <td className="py-1">{entry.flowrate !== null && entry.flowrate !== undefined ? `${Number(entry.flowrate).toFixed(2)} L/min` : '—'}</td>
                          <td className="py-1">{entry.battery !== null && entry.battery !== undefined ? `${Number(entry.battery).toFixed(1)}%` : '—'}</td>
                          <td className="py-1">{entry.rssi ?? '—'} dBm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">Logs série (USB)</h3>
                <div className="h-48 overflow-y-auto bg-black text-green-400 font-mono text-xs rounded-xl p-3">
                  {usbStreamLogs.length === 0 ? (
                    <p className="text-gray-400 text-center mt-10">
                      {usbStreamStatus === 'running' || usbStreamStatus === 'waiting'
                        ? 'En attente de logs...'
                        : 'Cliquez sur « Écouter » pour afficher les logs.'}
                    </p>
                  ) : (
                    usbStreamLogs.map(log => (
                      <div key={log.id} className="mb-1">
                        <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString('fr-FR')}]</span>{' '}
                        {log.line}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        )}
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

        {/* Sélecteur de firmware pour OTA */}
        <div className="flex items-center gap-2">
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Firmware OTA (à distance) 📡:
            </label>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Mise à jour via réseau 4G/WiFi
            </span>
          </div>
          <select
            value={selectedFirmwareVersion}
            onChange={(e) => {
              setSelectedFirmwareVersion(e.target.value)
              setOtaMessage(null)
              setOtaError(null)
            }}
            className="input min-w-[150px]"
            title="Sélectionnez un firmware pour mise à jour OTA (Over-The-Air) à distance"
          >
            <option value="">— Sélectionner —</option>
            {firmwares.map(fw => (
              <option key={fw.id} value={fw.version}>
                v{fw.version}
              </option>
            ))}
          </select>
          {selectedFirmwareVersion && devicesToUpdate.length > 1 && (
            <button
              onClick={handleOTAAll}
              disabled={Object.keys(otaDeploying).length > 0}
              className="btn-primary text-sm whitespace-nowrap"
              title={`Déployer OTA (à distance) sur tous les ${devicesToUpdate.length} dispositifs concernés via réseau 4G/WiFi`}
            >
              {Object.keys(otaDeploying).length > 0 ? '⏳ Déploiement...' : `📡 OTA tous (${devicesToUpdate.length})`}
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => {
                setShowUploadFirmwareModal(true)
                setFirmwareUploadError(null)
                setFirmwareUploadSuccess(null)
              }}
              className="btn-secondary text-sm whitespace-nowrap"
              title="Uploader un nouveau firmware"
            >
              📤 Upload Firmware
            </button>
          )}
        </div>
      </div>

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
                <th className="text-right py-3 px-4">Flash</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-gray-500">
                    Aucun dispositif trouvé
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device, i) => {
                  const status = getStatusBadge(device)
                  const battery = getBatteryBadge(device.last_battery)
                  const deviceFirmware = device.firmware_version || 'N/A'
                  // Un dispositif peut être mis à jour si : firmware N/A, différent, ou virtuel
                  const needsUpdate = selectedFirmwareVersion && (
                    device.isVirtual || 
                    deviceFirmware === 'N/A' || 
                    deviceFirmware === 'n/a' ||
                    deviceFirmware !== selectedFirmwareVersion
                  )
                  const isDeploying = otaDeploying[device.id]
                  
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
                            {selectedFirmwareVersion && (needsUpdate || device.firmware_version === 'N/A' || device.firmware_version === 'n/a') ? (() => {
                              const otaCheck = canReceiveOTA(device)
                              const isDisabled = isDeploying || !otaCheck.can
                              return (
                                <button
                                  onClick={(e) => handleOTA(device, e)}
                                  disabled={isDisabled}
                                  className={`text-xs px-3 py-1 ${
                                    isDisabled 
                                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                      : 'btn-primary'
                                  }`}
                                  title={
                                    isDisabled 
                                      ? `❌ ${otaCheck.reason}` 
                                      : `Mise à jour OTA (Over-The-Air) à distance via réseau 4G/WiFi vers v${selectedFirmwareVersion}`
                                  }
                                >
                                  {isDeploying ? '⏳' : '📡 OTA'}
                                </button>
                              )
                            })() : selectedFirmwareVersion && !needsUpdate && device.firmware_version !== 'N/A' && device.firmware_version !== 'n/a' ? (
                              <span className="text-xs text-gray-400">✓ À jour</span>
                            ) : null}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                // Pour les dispositifs virtuels, ne pas passer device (sera pris automatiquement)
                                setDeviceForFlash(device.isVirtual ? null : device)
                                setShowFlashUSBModal(true)
                              }}
                              className={`text-xs px-3 py-1 ${
                                (device.isVirtual && !isConnected)
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                  : 'btn-primary'
                              }`}
                              title="Flash USB local : mise à jour via câble USB (nécessite connexion physique)"
                              disabled={device.isVirtual && !isConnected}
                            >
                              📡 USB
                            </button>
                          </div>
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
                {isAdmin && (
                  <button
                    onClick={() => setModalActiveTab('commands')}
                    className={`px-4 py-3 font-medium text-sm border-b-2 transition-all ${
                      modalActiveTab === 'commands'
                        ? 'border-primary-500 dark:border-primary-400 text-primary-600 dark:text-primary-400'
                        : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    📡 Commandes ({deviceCommands.length})
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

                  {modalActiveTab === 'commands' && isAdmin && (
                    <div className="h-full flex flex-col space-y-6">
                      <div>
                        <h3 className="text-lg font-semibold mb-4 text-primary">📡 Commandes</h3>
                        {(commandError || commandSuccess) && (
                          <div className={`alert ${commandError ? 'alert-warning' : 'alert-success'} mb-4`}>
                            {commandError || commandSuccess}
                          </div>
                        )}
                      </div>

                      {/* Formulaire de commande */}
                      <div className="card">
                        <h4 className="text-md font-semibold mb-4 text-primary">Envoyer une commande</h4>
                        <form onSubmit={handleCreateCommand} className="space-y-4">
                          <div>
                            <label className="block text-sm font-medium text-muted mb-2">Type de commande *</label>
                            <select
                              className="input"
                              value={commandForm.command}
                              onChange={(e) => setCommandForm((prev) => ({ ...prev, command: e.target.value }))}
                              required
                            >
                              {commandOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Paramètres spécifiques selon le type de commande */}
                          {commandForm.command === 'SET_SLEEP_SECONDS' && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                              <label className="block text-sm font-medium text-muted mb-2">
                                Intervalle de sommeil (secondes) *
                              </label>
                              <input
                                type="number"
                                min={30}
                                max={7200}
                                className="input"
                                value={commandForm.sleepSeconds}
                                onChange={(e) => setCommandForm((prev) => ({ ...prev, sleepSeconds: e.target.value }))}
                                required
                              />
                              <p className="text-xs text-muted mt-1">Valeur entre 30 et 7200 secondes</p>
                            </div>
                          )}

                          {commandForm.command === 'PING' && (
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                              <label className="block text-sm font-medium text-muted mb-2">
                                Message de diagnostic (optionnel)
                              </label>
                              <input
                                type="text"
                                className="input"
                                placeholder="Ex: Test de connexion"
                                value={commandForm.message}
                                onChange={(e) => setCommandForm((prev) => ({ ...prev, message: e.target.value }))}
                              />
                              <p className="text-xs text-muted mt-1">Message qui sera renvoyé par le dispositif</p>
                            </div>
                          )}

                          {commandForm.command === 'UPDATE_CONFIG' && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 space-y-4">
                              <div className="bg-amber-100 dark:bg-amber-900/30 border-l-4 border-amber-500 dark:border-amber-400 p-3 rounded">
                                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">⚠️ Configuration avancée</p>
                                <p className="text-xs text-amber-700 dark:text-amber-300">
                                  Remplir uniquement les champs à modifier. Les valeurs vides seront ignorées.
                                </p>
                              </div>
                              
                              <div>
                                <p className="text-sm font-semibold text-primary mb-3">🔐 Identité & Réseau</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <input className="input" placeholder="APN" value={commandForm.configApn} onChange={(e) => setCommandForm((prev) => ({ ...prev, configApn: e.target.value }))} />
                                  <input className="input" placeholder="JWT Bearer..." value={commandForm.configJwt} onChange={(e) => setCommandForm((prev) => ({ ...prev, configJwt: e.target.value }))} />
                                  <input className="input" placeholder="ICCID" value={commandForm.configIccid} onChange={(e) => setCommandForm((prev) => ({ ...prev, configIccid: e.target.value }))} />
                                  <input className="input" placeholder="Numéro de série" value={commandForm.configSerial} onChange={(e) => setCommandForm((prev) => ({ ...prev, configSerial: e.target.value }))} />
                                  <input className="input" placeholder="PIN SIM" value={commandForm.configSimPin} onChange={(e) => setCommandForm((prev) => ({ ...prev, configSimPin: e.target.value }))} />
                                </div>
                              </div>

                              <div>
                                <p className="text-sm font-semibold text-primary mb-3">📊 Mesures & Sommeil</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <input type="number" min={1} className="input" placeholder="Sommeil par défaut (minutes)" value={commandForm.configSleepMinutes} onChange={(e) => setCommandForm((prev) => ({ ...prev, configSleepMinutes: e.target.value }))} />
                                  <input type="number" min={1} className="input" placeholder="Passes capteur" value={commandForm.configAirflowPasses} onChange={(e) => setCommandForm((prev) => ({ ...prev, configAirflowPasses: e.target.value }))} />
                                  <input type="number" min={1} className="input" placeholder="Échantillons / passe" value={commandForm.configAirflowSamples} onChange={(e) => setCommandForm((prev) => ({ ...prev, configAirflowSamples: e.target.value }))} />
                                  <input type="number" min={1} className="input" placeholder="Délai échantillons (ms)" value={commandForm.configAirflowDelay} onChange={(e) => setCommandForm((prev) => ({ ...prev, configAirflowDelay: e.target.value }))} />
                                </div>
                              </div>

                              <div>
                                <p className="text-sm font-semibold text-primary mb-3">⚙️ Watchdog & Modem</p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <input type="number" min={5} className="input" placeholder="Watchdog (secondes)" value={commandForm.configWatchdogSeconds} onChange={(e) => setCommandForm((prev) => ({ ...prev, configWatchdogSeconds: e.target.value }))} />
                                  <input type="number" min={1000} className="input" placeholder="Timeout boot modem (ms)" value={commandForm.configModemBootTimeout} onChange={(e) => setCommandForm((prev) => ({ ...prev, configModemBootTimeout: e.target.value }))} />
                                  <input type="number" min={1000} className="input" placeholder="Timeout SIM prête (ms)" value={commandForm.configSimReadyTimeout} onChange={(e) => setCommandForm((prev) => ({ ...prev, configSimReadyTimeout: e.target.value }))} />
                                  <input type="number" min={1000} className="input" placeholder="Timeout attache réseau (ms)" value={commandForm.configNetworkAttachTimeout} onChange={(e) => setCommandForm((prev) => ({ ...prev, configNetworkAttachTimeout: e.target.value }))} />
                                  <input type="number" min={1} className="input" placeholder="Redémarrages modem max" value={commandForm.configModemReboots} onChange={(e) => setCommandForm((prev) => ({ ...prev, configModemReboots: e.target.value }))} />
                                </div>
                              </div>

                              <div>
                                <p className="text-sm font-semibold text-primary mb-1">📡 Configuration OTA (Over-The-Air)</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                  Mise à jour à distance via réseau 4G/WiFi
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  <input className="input" placeholder="URL primaire" value={commandForm.configOtaPrimaryUrl} onChange={(e) => setCommandForm((prev) => ({ ...prev, configOtaPrimaryUrl: e.target.value }))} />
                                  <input className="input" placeholder="URL fallback" value={commandForm.configOtaFallbackUrl} onChange={(e) => setCommandForm((prev) => ({ ...prev, configOtaFallbackUrl: e.target.value }))} />
                                  <input className="input md:col-span-2" placeholder="MD5 attendu (optionnel)" value={commandForm.configOtaMd5} onChange={(e) => setCommandForm((prev) => ({ ...prev, configOtaMd5: e.target.value }))} />
                                </div>
                              </div>
                            </div>
                          )}

                          {commandForm.command === 'UPDATE_CALIBRATION' && (
                            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                              <p className="text-sm font-semibold text-primary mb-3">📐 Coefficients de calibration</p>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {['a0', 'a1', 'a2'].map((coef) => (
                                  <div key={coef}>
                                    <label className="block text-sm font-medium text-muted mb-1">
                                      Coefficient {coef.toUpperCase()} *
                                    </label>
                                    <input
                                      type="number"
                                      step="any"
                                      className="input"
                                      placeholder={`Valeur ${coef.toUpperCase()}`}
                                      value={commandForm[`cal${coef.toUpperCase()}`]}
                                      onChange={(e) =>
                                        setCommandForm((prev) => ({
                                          ...prev,
                                          [`cal${coef.toUpperCase()}`]: e.target.value,
                                        }))
                                      }
                                      required
                                    />
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {commandForm.command === 'OTA_REQUEST' && (
                            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4 space-y-3">
                              <div className="bg-orange-100 dark:bg-orange-900/30 border-l-4 border-orange-500 dark:border-orange-400 p-3 rounded">
                                <div className="mb-2">
                                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-1">📡 Mise à jour OTA (Over-The-Air)</p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">
                                    Mise à jour à distance via réseau 4G/WiFi. Le dispositif télécharge et installe le firmware automatiquement.
                                  </p>
                                </div>
                                <p className="text-xs text-orange-700 dark:text-orange-300">
                                  Laisser l&apos;URL vide pour utiliser la configuration stockée dans le dispositif.
                                </p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-muted mb-2">Canal OTA</label>
                                <select
                                  className="input"
                                  value={commandForm.otaChannel}
                                  onChange={(e) => setCommandForm((prev) => ({ ...prev, otaChannel: e.target.value }))}
                                >
                                  <option value="primary">Primaire</option>
                                  <option value="fallback">Fallback</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-muted mb-2">URL du firmware (optionnel)</label>
                                <input
                                  type="text"
                                  className="input"
                                  placeholder="https://..."
                                  value={commandForm.otaUrl}
                                  onChange={(e) => setCommandForm((prev) => ({ ...prev, otaUrl: e.target.value }))}
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-muted mb-2">MD5 attendu (optionnel)</label>
                                <input
                                  type="text"
                                  className="input"
                                  placeholder="Hash MD5 du firmware"
                                  value={commandForm.otaMd5}
                                  onChange={(e) => setCommandForm((prev) => ({ ...prev, otaMd5: e.target.value }))}
                                />
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-gray-200 dark:border-gray-700">
                            <div>
                              <label className="block text-sm font-medium text-muted mb-2">Priorité</label>
                              <select
                                className="input"
                                value={commandForm.priority}
                                onChange={(e) => setCommandForm((prev) => ({ ...prev, priority: e.target.value }))}
                              >
                                {priorityOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-muted mb-2">Expiration (minutes)</label>
                              <input
                                type="number"
                                min={5}
                                className="input"
                                value={commandForm.expiresInMinutes}
                                onChange={(e) => setCommandForm((prev) => ({ ...prev, expiresInMinutes: e.target.value }))}
                              />
                              <p className="text-xs text-muted mt-1">Temps avant expiration de la commande</p>
                            </div>
                          </div>

                          <button type="submit" className="btn-primary w-full" disabled={creatingCommand}>
                            {creatingCommand ? '⏳ Envoi en cours...' : '📤 Envoyer la commande'}
                          </button>
                        </form>
                      </div>

                      {/* Historique des commandes */}
                      <div className="card flex-1 overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-md font-semibold text-primary">Historique des commandes</h4>
                          <button 
                            className="btn-secondary text-sm" 
                            onClick={() => setCommandRefreshTick(tick => tick + 1)}
                          >
                            🔄 Actualiser
                          </button>
                        </div>
                        
                        {deviceCommands.length === 0 ? (
                          <div className="text-center py-12 text-muted">
                            <p className="text-sm">Aucune commande enregistrée pour ce dispositif</p>
        </div>
      ) : (
                          <div className="space-y-2">
                            {deviceCommands.map((cmd) => (
                              <div key={cmd.id} className="border border-gray-200/80 dark:border-slate-700/50 rounded-lg p-3 text-sm bg-gradient-to-br from-white to-gray-50/50 dark:from-slate-800/50 dark:to-slate-800/30 backdrop-blur-sm hover:shadow-md transition-all duration-200">
                                <div className="flex items-center justify-between mb-2">
                                  <span className="font-medium text-primary">{cmd.command}</span>
                                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${commandStatusColors[cmd.status] || 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                                    {cmd.status === 'pending' ? '⏳ En attente' :
                                     cmd.status === 'executed' ? '✅ Exécutée' :
                                     cmd.status === 'error' ? '❌ Erreur' :
                                     cmd.status === 'expired' ? '⏰ Expirée' :
                                     cmd.status === 'cancelled' ? '🚫 Annulée' :
                                     cmd.status}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs text-muted">
                                  <span>Priorité: {cmd.priority}</span>
                                  <span>{new Date(cmd.created_at ?? cmd.execute_after).toLocaleString('fr-FR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}</span>
                                </div>
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
      {assignModalOpen && selectedDevice && (
        <div className="fixed inset-0 bg-black/40 dark:bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gradient-to-br from-white to-gray-50/80 dark:from-slate-800/95 dark:to-slate-800/80 rounded-xl shadow-2xl w-full max-w-xl p-6 space-y-4 animate-scale-in backdrop-blur-md border border-gray-200/50 dark:border-slate-700/50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  {selectedDevice.patient_id ? 'Modifier l\'assignation' : 'Assigner le dispositif'}
                </h2>
                <p className="text-sm text-gray-500">
                  {selectedDevice.device_name || selectedDevice.sim_iccid}
                </p>
                {selectedDevice.first_name && (
                  <p className="text-xs text-amber-600 mt-1">
                    Actuellement assigné à : {selectedDevice.first_name} {selectedDevice.last_name}
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

      {/* Modal Flash USB */}
      <FlashUSBModal
        isOpen={showFlashUSBModal}
        onClose={() => {
          setShowFlashUSBModal(false)
          setDeviceForFlash(null)
        }}
        device={deviceForFlash || usbVirtualDevice || usbConnectedDevice}
      />

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
