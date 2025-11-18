'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import AlertCard from '@/components/AlertCard'
import FlashUSBModal from '@/components/FlashUSBModal'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { useSerialPort } from '@/components/SerialPortManager'

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

  // Charger les données initiales avec useApiData
  const { data, loading, error, refetch } = useApiData(
    ['/api.php/devices', '/api.php/patients', '/api.php/firmwares'],
    { requiresAuth: true }
  )

  const devices = data?.devices?.devices || []
  const patients = data?.patients?.patients || []
  const firmwares = data?.firmwares?.firmwares || []

  // Fonction pour détecter un dispositif sur un port (définie en premier)
  const detectDeviceOnPort = useCallback(async (targetPort) => {
    try {
      const portInfo = targetPort.getInfo()
      setUsbPortInfo(portInfo)
      
      // Connecter automatiquement
      const connected = await connect(targetPort, 115200)
      if (!connected) return null

      // Lire l'ICCID/serial/firmware
      let iccid = null
      let deviceSerial = null
      let firmwareVersion = null
      let receivedData = ''

      const stopReading = await startReading((data) => {
        receivedData += data
        // ICCID
        const iccidMatch = receivedData.match(/\+CCID:\s*(\d+)/i) || receivedData.match(/(\d{19,20})/)
        if (iccidMatch) {
          iccid = iccidMatch[1]
        }
        // Serial
        const serialMatch = receivedData.match(/SERIAL[:\s]+([A-Z0-9\-]+)/i) || receivedData.match(/IMEI[:\s]+([A-Z0-9]+)/i)
        if (serialMatch) {
          deviceSerial = serialMatch[1]
        }
        // Firmware version (plusieurs formats possibles)
        // Chercher dans différents formats de réponse AT
        const fwMatch = receivedData.match(/FIRMWARE[:\s=]+([\d.]+)/i) || 
                       receivedData.match(/VERSION[:\s=]+([\d.]+)/i) ||
                       receivedData.match(/FWVER[:\s=]+([\d.]+)/i) ||
                       receivedData.match(/\+CGMR[:\s]+([^\r\n]+)/i) ||
                       receivedData.match(/\+GMR[:\s]+([^\r\n]+)/i) ||
                       receivedData.match(/v?(\d+\.\d+\.\d+)/i) ||
                       receivedData.match(/(\d+\.\d+\.\d+)/) // Format simple X.Y.Z
        if (fwMatch) {
          firmwareVersion = fwMatch[1].trim()
          // Nettoyer la version (enlever les espaces, caractères non désirés)
          firmwareVersion = firmwareVersion.replace(/[^\d.]/g, '').substring(0, 20)
        }
      })

      // Envoyer les commandes AT pour obtenir les infos
      await write('AT\r\n') // Test de connexion
      await new Promise(resolve => setTimeout(resolve, 500))
      await write('AT+CCID\r\n')
      await new Promise(resolve => setTimeout(resolve, 1500))
      await write('AT+GSN\r\n')
      await new Promise(resolve => setTimeout(resolve, 1500))
      await write('AT+CGMR\r\n') // Version firmware modem
      await new Promise(resolve => setTimeout(resolve, 1500))
      await write('AT+GMR\r\n') // Version firmware alternative
      await new Promise(resolve => setTimeout(resolve, 1500))
      await write('ATI\r\n') // Informations générales
      await new Promise(resolve => setTimeout(resolve, 1500))
      // Commandes custom OTT si disponibles
      await write('AT+FIRMWARE?\r\n')
      await new Promise(resolve => setTimeout(resolve, 1500))
      await write('AT+VERSION?\r\n')
      await new Promise(resolve => setTimeout(resolve, 1500))
      await write('AT+FWVER?\r\n')
      await new Promise(resolve => setTimeout(resolve, 1500))

      if (stopReading) stopReading()

      // Chercher dans la base
      let foundDevice = null
      if (iccid) {
        foundDevice = devices.find(d => d.sim_iccid && d.sim_iccid.includes(iccid))
      }
      if (!foundDevice && deviceSerial) {
        foundDevice = devices.find(d => d.device_serial && d.device_serial.includes(deviceSerial))
      }

      if (foundDevice) {
        setUsbConnectedDevice(foundDevice)
        setUsbVirtualDevice(null)
        return foundDevice
      } else {
        // Créer un dispositif virtuel avec la version réelle du firmware
        const virtualDevice = {
          id: 'usb_virtual_' + Date.now(),
          device_name: `USB-${iccid ? iccid.slice(-4) : deviceSerial || 'UNKNOWN'}`,
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
        return virtualDevice
      }
    } catch (err) {
      console.error('Erreur détection dispositif:', err)
      return null
    }
  }, [connect, startReading, write, devices])

  // Détecter le dispositif connecté en USB (pour autoriser un nouveau port)
  const detectUSBDevice = useCallback(async () => {
    if (!isSupported) {
      alert('Web Serial API non supporté. Utilisez Chrome ou Edge.')
      return
    }

    setCheckingUSB(true)
    try {
      // Demander l'accès au port
      const selectedPort = await requestPort()
      if (!selectedPort) {
        setCheckingUSB(false)
        return
      }

      // Détecter le dispositif sur ce port
      await detectDeviceOnPort(selectedPort)
    } catch (err) {
      console.error('Erreur détection USB:', err)
      alert(`Erreur lors de la détection: ${err.message}`)
    } finally {
      setCheckingUSB(false)
    }
  }, [isSupported, requestPort, detectDeviceOnPort])

  // Déconnecter le port USB
  const disconnectUSB = useCallback(async () => {
    await disconnect()
    setUsbConnectedDevice(null)
    setUsbVirtualDevice(null)
    setUsbPortInfo(null)
  }, [disconnect])

  // Détection automatique au chargement (ports déjà autorisés)
  useEffect(() => {
    if (!isSupported || !autoDetecting || loading) return

    const autoDetect = async () => {
      try {
        // Récupérer les ports déjà autorisés (sans interaction utilisateur)
        const ports = await navigator.serial.getPorts()
        
        if (ports.length === 0) {
          setAutoDetecting(false)
          return
        }

        // Essayer tous les ports USB connectés
        for (const p of ports) {
          const info = p.getInfo()
          // Filtrer les ports USB
          if (info.usbVendorId || info.usbProductId) {
            const device = await detectDeviceOnPort(p)
            if (device) break // Arrêter au premier dispositif trouvé
          }
        }

        // Si pas de port USB spécifique, essayer le premier port
        if (!usbConnectedDevice && !usbVirtualDevice && ports.length > 0) {
          const firstPort = ports[0]
          const info = firstPort.getInfo()
          if (!info.usbVendorId && !info.usbProductId) {
            // Port série non-USB, essayer quand même
            await detectDeviceOnPort(firstPort)
          }
        }
      } catch (err) {
        console.log('Détection automatique USB:', err.message)
      } finally {
        setAutoDetecting(false)
      }
    }

    // Attendre que les devices soient chargés
    if (devices.length > 0 || !loading) {
      autoDetect()
    }
  }, [isSupported, autoDetecting, devices, loading, detectDeviceOnPort, usbConnectedDevice, usbVirtualDevice])

  // Écouter les nouveaux ports connectés
  useEffect(() => {
    if (!isSupported) return

    const handleConnect = async (event) => {
      try {
        // Nouveau port détecté, essayer de se connecter automatiquement
        const port = event.target
        const device = await detectDeviceOnPort(port)
        if (device) {
          console.log('Nouveau dispositif USB détecté:', device)
        }
      } catch (err) {
        console.error('Erreur connexion nouveau port:', err)
      }
    }

    navigator.serial.addEventListener('connect', handleConnect)
    return () => {
      navigator.serial.removeEventListener('connect', handleConnect)
    }
  }, [isSupported, detectDeviceOnPort])

  // Fonction pour déclencher OTA sur un dispositif
  const handleOTA = async (device, e) => {
    e.stopPropagation() // Empêcher l'ouverture du modal
    if (!selectedFirmwareVersion) {
      setOtaError('Veuillez sélectionner un firmware')
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
    } catch (err) {
      setOtaError(err.message || 'Erreur lors du déploiement OTA')
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

    const confirmMessage = `⚠️ ATTENTION : Déploiement massif OTA\n\n` +
      `Firmware: v${selectedFirmwareVersion}\n` +
      `Dispositifs concernés: ${devicesToUpdate.length}\n\n` +
      `Cette opération va déployer le firmware sur TOUS les dispositifs listés.\n` +
      `Cela peut planter les dispositifs si le firmware est incompatible.\n\n` +
      `Êtes-vous sûr de vouloir continuer ?`

    if (!confirm(confirmMessage)) return

    setOtaError(null)
    setOtaMessage(null)
    const allDeviceIds = devicesToUpdate.map(d => d.id)
    
    // Marquer tous comme en cours de déploiement
    const deployingState = {}
    allDeviceIds.forEach(id => { deployingState[id] = true })
    setOtaDeploying(deployingState)

    let successCount = 0
    let errorCount = 0

    try {
      // Déployer sur tous les dispositifs en parallèle
      const promises = allDeviceIds.map(async (deviceId) => {
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
          console.error(`Erreur OTA pour dispositif ${deviceId}:`, err)
        }
      })

      await Promise.all(promises)

      if (errorCount === 0) {
        setOtaMessage(`✅ OTA v${selectedFirmwareVersion} programmé avec succès sur ${successCount} dispositif(s)`)
      } else {
        setOtaError(`⚠️ Déploiement partiel : ${successCount} succès, ${errorCount} erreur(s)`)
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
      const matchesSearch =
        d.device_name?.toLowerCase().includes(needle) ||
    d.sim_iccid?.includes(searchTerm) ||
        `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes(needle)

      const isAssigned = Boolean(d.patient_id)
      const matchesAssignment =
        assignmentFilter === 'all' ||
        (assignmentFilter === 'assigned' && isAssigned) ||
        (assignmentFilter === 'unassigned' && !isAssigned)

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
      setDeviceAlerts((alertsData.alerts || []).filter(a => a.status !== 'resolved'))
      setDeviceMeasurements(historyData.measurements || [])
      // Filtrer les commandes pour ce dispositif uniquement
      const filteredCommands = (commandsData.commands || []).filter(cmd => 
        String(cmd.device_id) === String(device.id) || cmd.sim_iccid === device.sim_iccid
      )
      setDeviceCommands(filteredCommands)
      setDeviceDetails(device)
    } catch (err) {
      console.error(err)
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
      console.error('Erreur chargement commandes:', err)
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
      console.error(err)
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
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
            Firmware OTA:
          </label>
          <select
            value={selectedFirmwareVersion}
            onChange={(e) => {
              setSelectedFirmwareVersion(e.target.value)
              setOtaMessage(null)
              setOtaError(null)
            }}
            className="input min-w-[150px]"
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
              title={`Flasher tous les ${devicesToUpdate.length} dispositifs concernés`}
            >
              {Object.keys(otaDeploying).length > 0 ? '⏳ Déploiement...' : `🚀 Flasher tous (${devicesToUpdate.length})`}
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
                {selectedFirmwareVersion && (
                  <th className="text-right py-3 px-4">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan={selectedFirmwareVersion ? 7 : 6} className="py-8 text-center text-gray-500">
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
                        {device.isVirtual && latestFirmwareVersion ? (
                          <span className="text-sm font-mono text-primary">Flash (v{latestFirmwareVersion})</span>
                        ) : (
                          <span className="text-sm font-mono">{device.firmware_version || 'N/A'}</span>
                        )}
                        {device.ota_pending && (
                          <span className="badge badge-warning text-xs ml-2">OTA en attente</span>
                        )}
                        {needsUpdate && !device.isVirtual && (
                          <span className="badge badge-info text-xs ml-2">→ v{selectedFirmwareVersion}</span>
                        )}
                      </td>
                      {selectedFirmwareVersion && (
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {needsUpdate || device.firmware_version === 'N/A' || device.firmware_version === 'n/a' ? (
                              <button
                                onClick={(e) => handleOTA(device, e)}
                                disabled={isDeploying}
                                className="btn-primary text-xs px-3 py-1"
                                title={`Flasher OTA vers v${selectedFirmwareVersion}`}
                              >
                                {isDeploying ? '⏳' : '⬆️ OTA'}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-400">✓ À jour</span>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                // Pour les dispositifs virtuels, ne pas passer device (sera pris automatiquement)
                                setDeviceForFlash(device.isVirtual ? null : device)
                                setShowFlashUSBModal(true)
                              }}
                              className="btn-secondary text-xs px-3 py-1"
                              title="Flasher via USB"
                              disabled={device.isVirtual && !isConnected}
                            >
                              🔌 USB
                            </button>
                          </div>
                        </td>
                      )}
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
                                <p className="text-sm font-semibold text-primary mb-3">⬆️ OTA par défaut</p>
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
                                <p className="text-sm font-semibold text-orange-800 dark:text-orange-300 mb-1">⚠️ Mise à jour OTA</p>
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
                
                // Fermer le modal après 2 secondes
                setTimeout(() => {
                  setShowUploadFirmwareModal(false)
                  setFirmwareUploadSuccess(null)
                }, 2000)
              } catch (err) {
                console.error('Erreur upload firmware:', err)
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
