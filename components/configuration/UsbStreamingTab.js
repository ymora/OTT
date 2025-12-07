'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useUsb } from '@/contexts/UsbContext'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData, useTimers, useEntityRestore } from '@/hooks'
import { createUpdateConfigCommand, createUpdateCalibrationCommand } from '@/lib/deviceCommands'
import { getUsbDeviceLabel } from '@/lib/usbDevices'
import { isArchived } from '@/lib/utils'
import logger from '@/lib/logger'
import Modal from '@/components/Modal'
import ConfirmModal from '@/components/ConfirmModal'
import FlashModal from '@/components/FlashModal'
import DeviceModal from '@/components/DeviceModal'
import DeviceMeasurementsModal from '@/components/DeviceMeasurementsModal'
import SuccessMessage from '@/components/SuccessMessage'

export default function DebugTab() {
  const usbContext = useUsb()
  
  // Références pour gérer les timeouts avec cleanup
  const timeoutRefs = useRef([])
  const isMountedRef = useRef(true)
  
  // Nettoyer tous les timeouts au démontage
  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      timeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId))
      timeoutRefs.current = []
    }
  }, [])
  
  // Fonction utilitaire pour créer un timeout avec cleanup
  const createTimeoutWithCleanup = (callback, delay) => {
    if (!isMountedRef.current) return null
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        callback()
      }
      timeoutRefs.current = timeoutRefs.current.filter(id => id !== timeoutId)
    }, delay)
    timeoutRefs.current.push(timeoutId)
    return timeoutId
  }
  
  const {
    usbConnectedDevice,
    setUsbConnectedDevice,
    usbVirtualDevice,
    setUsbVirtualDevice,
    usbDeviceInfo, // Données reçues du dispositif USB en temps réel (uniquement depuis le dispositif)
    isSupported,
    isConnected,
    port,
    usbStreamStatus,
    usbStreamMeasurements,
    usbStreamLogs,
    usbStreamError,
    usbStreamLastMeasurement,
    usbStreamLastUpdate,
    requestPort,
    connect,
    startReading,
    write,
    startUsbStreaming,
    pauseUsbStreaming,
    appendUsbStreamLog,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback
  } = usbContext
  
  // Cleanup au démontage
  useEffect(() => {
    return () => {
      logger.debug('[USB-TAB] Cleanup')
    }
  }, [])
  
  // Log contexte USB uniquement si changement important
  useEffect(() => {
    if (usbDeviceInfo?.sim_iccid) {
      logger.debug('[USB-TAB] Device:', usbDeviceInfo.sim_iccid?.slice(-4))
    }
  }, [usbDeviceInfo?.sim_iccid])
  
  const { fetchWithAuth, API_URL, user } = useAuth()
  
  // Helper pour vérifier les permissions
  const hasPermission = (permission) => {
    if (!permission) return true
    if (user?.role_name === 'admin') return true
    return user?.permissions?.includes(permission) || false
  }

  // Fonction pour formater le JSON de manière lisible
  const formatJsonLog = useCallback((logLine) => {
    // Détecter si c'est un JSON compact (commence par { et contient usb_stream)
    if (!logLine?.trim().startsWith('{') || !logLine.includes('usb_stream')) {
      return null // Pas un JSON USB stream
    }
    
    try {
      const json = JSON.parse(logLine.trim())
      
      // Formater de manière concise et lisible sur une seule ligne
      const parts = []
      if (json.seq) parts.push(`Seq=${json.seq}`)
      if (json.flow_lpm != null || json.flowrate != null) {
        parts.push(`Flow=${((json.flow_lpm || json.flowrate || 0).toFixed(2))} L/min`)
      }
      if (json.battery_percent != null || json.battery != null) {
        parts.push(`Bat=${((json.battery_percent || json.battery || 0).toFixed(1))}%`)
      }
      if (json.rssi != null) parts.push(`RSSI=${json.rssi} dBm`)
      if (json.latitude != null && json.longitude != null) {
        parts.push(`GPS=${json.latitude.toFixed(4)},${json.longitude.toFixed(4)}`)
      }
      if (json.device_name || json.device_serial) {
        parts.push(`Device=${json.device_name || json.device_serial || 'N/A'}`)
      }
      
      return parts.length > 0 ? `[USB_STREAM] ${parts.join(' | ')}` : null
    } catch (e) {
      return null // JSON invalide, afficher tel quel
    }
  }, [])

  // Fonction pour analyser et catégoriser un log (comme le script PowerShell)
  const analyzeLogCategory = useCallback((logLine) => {
    if (!logLine) return 'default'
    
    const line = logLine.toUpperCase()
    
    // Erreurs (priorité haute)
    const errorPatterns = [
      'ERROR', '❌', 'ÉCHEC', 'FAIL', 'FATAL', 'EXCEPTION',
      'ERREUR JSON', 'ERREUR PARSING', 'DATABASE ERROR'
    ]
    if (errorPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'error'
    }
    
    // Avertissements
    const warningPatterns = [
      'WARN', '⚠️', 'WARNING', 'ATTENTION', 'TIMEOUT',
      'COMMANDE INCONNUE', 'NON DISPONIBLE'
    ]
    if (warningPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'warning'
    }
    
    // GPS (doit venir avant Sensor car Sensor peut contenir d'autres mots)
    const gpsPatterns = [
      '[GPS]', 'GPS', 'LATITUDE', 'LONGITUDE', 'SATELLITE',
      'FIX', 'COORDONNÉES', 'GÉOLOCALISATION'
    ]
    if (gpsPatterns.some(pattern => line.includes(pattern))) {
      return 'gps'
    }
    
    // Modem
    const modemPatterns = [
      '[MODEM]', 'MODEM', 'SIM', 'CSQ', 'RSSI', 'SIGNAL',
      'OPÉRATEUR', 'ATTACHÉ', 'ENREGISTREMENT', 'APN'
    ]
    if (modemPatterns.some(pattern => line.includes(pattern))) {
      return 'modem'
    }
    
    // Sensor
    const sensorPatterns = [
      '[SENSOR]', 'AIRFLOW', 'FLOW', 'BATTERY', 'BATTERIE',
      'MESURE', 'CAPTURE', 'ADC', 'V_ADC', 'V_BATT'
    ]
    if (sensorPatterns.some(pattern => line.includes(pattern))) {
      return 'sensor'
    }
    
    // USB
    const usbPatterns = [
      'USB_STREAM', 'USB STREAM', 'USB', 'SERIAL', 'SÉRIE'
    ]
    if (usbPatterns.some(pattern => line.includes(pattern))) {
      return 'usb'
    }
    
    return 'default'
  }, [])

  // Fonction pour obtenir la classe CSS selon la catégorie
  const getLogColorClass = useCallback((category, isDashboard) => {
    if (isDashboard) {
      return 'text-blue-400 dark:text-blue-300' // Logs du dashboard en bleu
    }
    
    switch (category) {
      case 'error':
        return 'text-red-400 dark:text-red-300'
      case 'warning':
        return 'text-yellow-400 dark:text-yellow-300'
      case 'gps':
        return 'text-cyan-400 dark:text-cyan-300'
      case 'modem':
        return 'text-purple-400 dark:text-purple-300'
      case 'sensor':
        return 'text-green-400 dark:text-green-300'
      case 'usb':
        return 'text-blue-400 dark:text-blue-300'
      default:
        return 'text-gray-300 dark:text-gray-400'
    }
  }, [])
  
  // Toggle pour afficher les archives
  const [showArchived, setShowArchived] = useState(false)
  
  // Charger tous les dispositifs pour le tableau
  // Le hook useApiData se recharge automatiquement quand l'endpoint change (showArchived)
  // Pas besoin de useEffect supplémentaire car useApiData détecte le changement d'endpoint via endpointsKey
  const { data: devicesData, loading: devicesLoading, refetch: refetchDevices, invalidateCache } = useApiData(
    useMemo(() => [showArchived ? '/api.php/devices?include_deleted=true' : '/api.php/devices'], [showArchived]),
    { requiresAuth: true, autoLoad: !!user, cacheTTL: 30000 } // Cache de 30 secondes pour éviter les refetch intempestifs
  )
  
  // Utiliser le hook unifié pour la restauration
  const { restore: handleRestoreDeviceDirect, restoring: restoringDevice } = useEntityRestore('devices', {
    onSuccess: (device) => {
      logger.log(`✅ Dispositif "${device.device_name || device.sim_iccid}" restauré avec succès`)
      appendUsbStreamLog(`✅ Dispositif "${device.device_name || device.sim_iccid}" restauré`, 'dashboard')
      // Debounce pour éviter les refetch multiples rapides qui causent des sauts visuels
      invalidateCache()
      createTimeoutWithCleanup(async () => {
        await refetchDevices()
      }, 500)
    },
    onError: (errorMessage) => {
      logger.error('Erreur restauration device:', errorMessage)
      appendUsbStreamLog(`❌ Erreur restauration: ${errorMessage}`, 'dashboard')
    },
    invalidateCache,
    refetch: refetchDevices
  })
  const allDevicesFromApi = devicesData?.devices?.devices || []
  
  // Séparer les dispositifs actifs et archivés
  const allDevices = useMemo(() => {
    return allDevicesFromApi
  }, [allDevicesFromApi])
  
  const devices = useMemo(() => {
    return allDevices.filter(d => !isArchived(d))
  }, [allDevices])
  
  const archivedDevices = useMemo(() => {
    return allDevices.filter(d => isArchived(d))
  }, [allDevices])
  
  // Dispositifs à afficher selon le toggle
  const devicesToDisplay = showArchived ? allDevices : devices
  
  // ========== STREAMING LOGS EN TEMPS RÉEL (pour admin à distance) ==========
  const [remoteLogs, setRemoteLogs] = useState([])
  const [isStreamingRemote, setIsStreamingRemote] = useState(false)
  const lastLogTimestampRef = useRef(0)
  
  // Charger les logs distants depuis l'API
  const loadRemoteLogs = useCallback(async (deviceIdentifier, sinceTimestamp = null) => {
    if (!user || user.role_name !== 'admin' || !fetchWithAuth || !API_URL) {
      return
    }
    
    try {
      // Charger uniquement les nouveaux logs (depuis le dernier timestamp)
      const url = sinceTimestamp 
        ? `/api.php/usb-logs/${encodeURIComponent(deviceIdentifier)}?limit=100&since=${sinceTimestamp}`
        : `/api.php/usb-logs/${encodeURIComponent(deviceIdentifier)}?limit=100`
      
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        url,
        {},
        { requiresAuth: true }
      )
      
      if (response.success && response.logs) {
        const formattedLogs = response.logs.map(log => ({
          id: `remote-${log.id}`,
          line: log.log_line,
          timestamp: log.timestamp_ms || new Date(log.created_at).getTime(),
          source: log.log_source,
          isRemote: true
        }))
        
        if (sinceTimestamp) {
          // Ajouter uniquement les nouveaux logs
          setRemoteLogs(prev => {
            const merged = [...prev, ...formattedLogs]
            // Dédupliquer par ID
            const unique = merged.filter((log, index, self) => 
              index === self.findIndex(l => l.id === log.id)
            )
            return unique.sort((a, b) => a.timestamp - b.timestamp).slice(-100)
          })
        } else {
          // Remplacer tous les logs
          setRemoteLogs(formattedLogs)
        }
        
        // Mettre à jour le timestamp du dernier log
        if (formattedLogs.length > 0) {
          const lastTimestamp = Math.max(...formattedLogs.map(l => l.timestamp))
          lastLogTimestampRef.current = lastTimestamp
        }
      }
    } catch (err) {
      logger.error('Erreur chargement logs distants:', err)
    }
  }, [user, fetchWithAuth, API_URL])
  
  // AUTO-SÉLECTION du device avec badge ● LIVE pour admin distant
  useEffect(() => {
    if (user?.role_name !== 'admin' || isConnected || usbVirtualDevice || allDevices.length === 0) {
      return
    }
    
    // Vérifier quel device a des logs USB récents (< 30s = LIVE streaming)
    const checkLiveDevices = async () => {
      try {
        // Chercher parmi tous les devices celui qui a des logs USB très récents
        const thirtySecondsAgo = Date.now() - 30000
        
        for (const device of allDevices) {
          const deviceId = device.sim_iccid || device.device_serial || device.id
          
          // Vérifier s'il y a des logs USB récents pour ce device
          const response = await fetchJson(
            fetchWithAuth,
            API_URL,
            `/api.php/usb-logs/${encodeURIComponent(deviceId)}?limit=1`,
            {},
            { requiresAuth: true }
          )
          
          if (response.success && response.logs && response.logs.length > 0) {
            const lastLog = response.logs[0]
            const lastLogTime = new Date(lastLog.created_at).getTime()
            
            // Si le dernier log a moins de 30s = device est LIVE (USB connecté ailleurs)
            if (lastLogTime > thirtySecondsAgo) {
              logger.log(`🔴 [AUTO-SELECT] Device LIVE détecté: ${device.device_name} (logs < 30s)`)
              setUsbVirtualDevice({ ...device, isVirtual: true })
              break // On prend le premier trouvé
            }
          }
        }
      } catch (err) {
        logger.debug('Erreur détection device LIVE:', err)
      }
    }
    
    checkLiveDevices()
  }, [user, isConnected, usbVirtualDevice, allDevices, setUsbVirtualDevice, fetchWithAuth, API_URL])
  
  // Déterminer si on doit utiliser les logs distants (admin sans USB local)
  const currentDevice = usbConnectedDevice || usbVirtualDevice
  const shouldUseRemoteLogs = useMemo(() => {
    return user?.role_name === 'admin' && !isConnected && currentDevice
  }, [user, isConnected, currentDevice])
  
  // Fusionner les logs locaux et distants
  const allLogs = useMemo(() => {
    // Si on a une connexion USB locale, utiliser uniquement les logs locaux
    if (isConnected || usbStreamLogs.length > 0) {
      return usbStreamLogs
    }
    
    // Sinon, utiliser les logs distants (pour admin)
    if (shouldUseRemoteLogs) {
      return remoteLogs
    }
    
    return []
  }, [usbStreamLogs, remoteLogs, isConnected, shouldUseRemoteLogs])
  
  // STREAMING AUTOMATIQUE en temps réel pour les admins
  useEffect(() => {
    if (!shouldUseRemoteLogs || !currentDevice) {
      setIsStreamingRemote(false)
      setRemoteLogs([])
      lastLogTimestampRef.current = 0
      return
    }
    
    const deviceId = currentDevice.sim_iccid || currentDevice.device_serial || currentDevice.device_name
    
    // Chargement initial
    setIsStreamingRemote(true)
    loadRemoteLogs(deviceId, null)
    
    // Polling toutes les 2 secondes pour un vrai streaming temps réel
    const interval = setInterval(() => {
      loadRemoteLogs(deviceId, lastLogTimestampRef.current)
    }, 2000)
    
    return () => {
      clearInterval(interval)
      setIsStreamingRemote(false)
    }
  }, [shouldUseRemoteLogs, currentDevice, loadRemoteLogs])
  
  // ========== CONFIGURATION DES CALLBACKS USB ==========
  // Configurer les callbacks pour enregistrer automatiquement les dispositifs dans la base
  useEffect(() => {
    if (!fetchWithAuth || !API_URL) {
      return
    }
    
    // Callback pour envoyer les mesures à l'API
    const sendMeasurement = async (measurementData) => {
      const apiUrl = `${API_URL}/api.php/devices/measurements`
      logger.log('🚀 [CALLBACK] sendMeasurement APPELÉ !', measurementData)
      appendUsbStreamLog(`🚀 Envoi mesure à l'API distante: ${apiUrl}`)
      appendUsbStreamLog(`📤 Données: ICCID=${measurementData.sim_iccid || 'N/A'} | Débit=${measurementData.flowrate ?? 0} L/min | Batterie=${measurementData.battery ?? 'N/A'}% | RSSI=${measurementData.rssi ?? 'N/A'}`)
      
      try {
        logger.log('📤 Envoi mesure USB à l\'API:', { apiUrl, measurementData })
        
        const response = await fetchWithAuth(
          apiUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(measurementData)
          },
          { requiresAuth: false }
        )
        
        appendUsbStreamLog(`📡 Réponse API: HTTP ${response.status} ${response.statusText}`)
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg = errorData.error || `Erreur HTTP ${response.status}`
          logger.error('❌ Réponse API erreur:', response.status, errorData)
          appendUsbStreamLog(`❌ Erreur API: ${errorMsg}`)
          throw new Error(errorMsg)
        }
        
        const result = await response.json()
        logger.log('✅ Mesure USB enregistrée:', result)
        appendUsbStreamLog(`✅ Mesure enregistrée avec succès dans la base distante (device_id: ${result.device_id || 'N/A'})`)
        
        // Rafraîchir les données après l'enregistrement
        createTimeoutWithCleanup(() => {
          logger.log('🔄 Rafraîchissement des dispositifs...')
          refetchDevices()
          notifyDevicesUpdated()
        }, 500)
        
        return result
      } catch (err) {
        const errorMsg = err.message || 'Erreur inconnue'
        logger.error('❌ Erreur envoi mesure USB:', err)
        appendUsbStreamLog(`❌ ÉCHEC envoi mesure: ${errorMsg}`)
        if (err.cause || err.stack) {
          appendUsbStreamLog(`   Détails: ${err.cause || err.stack?.substring(0, 100) || ''}`)
        }
        throw err
      }
    }
    
    // Callback pour mettre à jour les informations du dispositif
    const updateDevice = async (identifier, firmwareVersion, updateData = {}) => {
      logger.log('🚀 [CALLBACK] updateDevice APPELÉ !', { identifier, firmwareVersion, updateData })
      try {
        // Récupérer la liste actuelle des dispositifs
        const devicesResponse = await fetchWithAuth(
          `${API_URL}/api.php/devices`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (!devicesResponse.ok) return
        
        const devicesData = await devicesResponse.json()
        const devices = devicesData.devices || []
        
        const device = devices.find(d => 
          d.sim_iccid === identifier || 
          d.device_serial === identifier ||
          d.device_name === identifier
        )
        
        // ✨ AUTO-CRÉATION: Si le dispositif n'existe pas, le créer automatiquement
        if (!device) {
          logger.log(`🆕 [AUTO-CREATE] Dispositif non trouvé (${identifier}), création automatique...`)
          
          const createPayload = {
            device_name: updateData.device_name || `USB-${identifier.slice(-4)}`,
            sim_iccid: updateData.sim_iccid || (identifier.startsWith('89') ? identifier : null),
            device_serial: updateData.device_serial || (!identifier.startsWith('89') ? identifier : null),
            firmware_version: firmwareVersion || null,
            status: updateData.status || 'usb_connected',
            last_seen: updateData.last_seen || new Date().toISOString()
          }
          
          // Ajouter les valeurs optionnelles si disponibles
          if (updateData.last_battery !== undefined) createPayload.last_battery = updateData.last_battery
          if (updateData.last_flowrate !== undefined) createPayload.last_flowrate = updateData.last_flowrate
          if (updateData.last_rssi !== undefined) createPayload.last_rssi = updateData.last_rssi
          
          try {
            const createResponse = await fetchWithAuth(
              `${API_URL}/api.php/devices`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createPayload)
              },
              { requiresAuth: true }
            )
            
            if (createResponse.ok) {
              const result = await createResponse.json()
              logger.log('✅ [AUTO-CREATE] Dispositif créé avec succès:', result.device)
              
              // Rafraîchir la liste des dispositifs
              createTimeoutWithCleanup(() => {
                refetchDevices()
                notifyDevicesUpdated()
              }, 500)
              
              return result
            } else {
              logger.error('❌ [AUTO-CREATE] Échec création dispositif')
              return
            }
          } catch (createErr) {
            logger.error('❌ [AUTO-CREATE] Erreur:', createErr)
            return
          }
        }
        
        // MISE À JOUR: Le dispositif existe, le mettre à jour
        const updatePayload = { ...updateData }
        if (firmwareVersion && firmwareVersion !== '') {
          updatePayload.firmware_version = firmwareVersion
        }
        
        const response = await fetchWithAuth(
          `${API_URL}/api.php/devices/${device.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          },
          { requiresAuth: true }
        )
        
        if (response.ok) {
          logger.log(`✅ [AUTO-UPDATE] Dispositif ${device.id} mis à jour`)
          createTimeoutWithCleanup(() => {
            refetchDevices()
            notifyDevicesUpdated()
          }, 500)
        }
        
        return await response.json()
      } catch (err) {
        logger.error('❌ Erreur mise à jour dispositif:', err)
      }
    }
    
    // Configurer les callbacks UNE SEULE FOIS
    setSendMeasurementCallback(sendMeasurement)
    setUpdateDeviceFirmwareCallback(updateDevice)
    
    logger.debug('[USB] Callbacks configurés', { API_URL })
    appendUsbStreamLog(`✅ Callbacks USB configurés - API URL: ${API_URL}`)
    
    // Cleanup au démontage
    return () => {
      setSendMeasurementCallback(null)
      setUpdateDeviceFirmwareCallback(null)
    }
  }, [fetchWithAuth, API_URL, setSendMeasurementCallback, setUpdateDeviceFirmwareCallback])
  // NE PAS ajouter allDevices, refetchDevices dans les dépendances - ça causerait des re-renders infinis
  
  // Fonction pour notifier les autres composants que les dispositifs ont changé
  const notifyDevicesUpdated = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ott-devices-updated'))
      try {
        window.localStorage.setItem('ott-devices-last-update', Date.now().toString())
      } catch (err) {
        // Ignorer les erreurs localStorage
      }
    }
  }, [])
  
  // Charger les patients pour l'assignation
  const { data: patientsData, loading: patientsLoading } = useApiData(
    ['/api.php/patients'],
    { requiresAuth: true, autoLoad: !!user }
  )
  const allPatients = patientsData?.patients?.patients || []
  
  // Charger les firmwares compilés pour le flash
  const { data: firmwaresData, loading: firmwaresLoading } = useApiData(
    ['/api.php/firmwares'],
    { requiresAuth: true, autoLoad: !!user }
  )
  const compiledFirmwares = (firmwaresData?.firmwares?.firmwares || []).filter(fw => fw.status === 'compiled')
  
  // États pour la suppression
  const [deleting, setDeleting] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  
  // État pour le modal RAZ console
  const [showClearLogsModal, setShowClearLogsModal] = useState(false)
  
  // États unifiés pour création et modification (comme pour patients et utilisateurs)
  
  // États pour l'assignation de patient
  const [showAssignPatientModal, setShowAssignPatientModal] = useState(false)
  const [deviceToAssign, setDeviceToAssign] = useState(null)
  const [assigningPatient, setAssigningPatient] = useState(false)
  
  // États pour la désassignation de patient
  const [showUnassignPatientModal, setShowUnassignPatientModal] = useState(false)
  const [deviceToUnassign, setDeviceToUnassign] = useState(null)
  const [unassigningPatient, setUnassigningPatient] = useState(false)
  
  // États pour l'historique des mesures
  const [showMeasurementsModal, setShowMeasurementsModal] = useState(false)
  const [deviceForMeasurements, setDeviceForMeasurements] = useState(null)
  
  // États pour le flash
  const [showFlashModal, setShowFlashModal] = useState(false)
  const [deviceToFlash, setDeviceToFlash] = useState(null)
  
  // États unifiés pour création et modification (comme pour patients et utilisateurs)
  const [showDeviceModal, setShowDeviceModal] = useState(false)
  const [editingDevice, setEditingDevice] = useState(null) // null = création, objet = modification
  
  const [availablePorts, setAvailablePorts] = useState([])
  const [selectedPortId, setSelectedPortId] = useState('')
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [sendingCommand, setSendingCommand] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now())
  
  // Données de la base de données (chargées une fois qu'on a l'identifiant)
  const [dbDeviceData, setDbDeviceData] = useState(null)
  const [loadingDbData, setLoadingDbData] = useState(false)
  const [dataSource, setDataSource] = useState(null) // 'usb' | 'database' | null
  
  // Valeurs calculées mémorisées pour éviter les recalculs
  const isStreaming = useMemo(() => 
    usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting',
    [usbStreamStatus]
  )
  const isPaused = useMemo(() => usbStreamStatus === 'paused', [usbStreamStatus])
  const isReady = useMemo(() => isConnected || isStreaming || isPaused || dbDeviceData, [isConnected, isStreaming, isPaused, dbDeviceData])
  // isDisabled : seulement pour les actions (pas pour l'affichage des données)
  const isDisabled = useMemo(() => !isConnected, [isConnected])
  
  // ========== SYNCHRONISATION DISPOSITIF USB ==========
  // Créer un dispositif virtuel temporaire pour que les callbacks soient appelés
  // La création en base se fait automatiquement via callbacks → /api.php/devices/measurements
  useEffect(() => {
    if (!usbDeviceInfo || !isConnected) {
      logger.debug('🔵 [SYNC] Pas de sync - usbDeviceInfo ou isConnected manquant')
      return
    }
    
    const simIccid = usbDeviceInfo.sim_iccid
    const deviceSerial = usbDeviceInfo.device_serial
    
    logger.log('🔍 [SYNC] Recherche device:', { 
      iccid: simIccid?.slice(-10), 
      serial: deviceSerial,
      allDevicesCount: allDevices.length 
    })
    
    // Chercher si le dispositif existe déjà en base (recherche simple et efficace)
    const existingDevice = allDevices.find(d => 
      d.sim_iccid === simIccid || d.device_serial === deviceSerial
    )
    
    logger.log(existingDevice 
      ? `✅ [SYNC] Trouvé: ${existingDevice.device_name}`
      : `📝 [SYNC] NOUVEAU → Création auto...`
    )
    
    if (existingDevice) {
      // Dispositif trouvé → lier au contexte (simple et direct)
      if (!usbConnectedDevice || usbConnectedDevice.id !== existingDevice.id) {
        setUsbConnectedDevice({ ...existingDevice, isVirtual: false })
        setUsbVirtualDevice(null)
      }
    } else {
      // Dispositif pas en base → AUTO-SYNC (création ou restauration)
      logger.log('📝 [AUTO-SYNC] Création device:', { iccid: simIccid?.slice(-10), serial: deviceSerial })
      
      const deviceName = usbDeviceInfo.device_name || `USB-${simIccid?.slice(-4) || deviceSerial?.slice(-4) || 'XXXX'}`
      
      // Fonction simplifiée d'auto-sync (une seule tentative, UPSERT backend)
      const autoSyncDevice = async () => {
        try {
          const response = await fetchWithAuth(
            `${API_URL}/api.php/devices`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                device_name: deviceName,
                sim_iccid: simIccid || null,
                device_serial: deviceSerial || null,
                firmware_version: usbDeviceInfo.firmware_version || null,
                status: 'active',
                last_seen: new Date().toISOString()
              })
            },
            { requiresAuth: true }
          )
          
          if (response.ok) {
            const data = await response.json()
            if (data.success && data.device) {
              const action = data.was_created ? 'créé' : 'restauré'
              logger.log(`✅ [AUTO-SYNC] Dispositif ${action}:`, data.device.device_name)
              
              // Définir comme dispositif connecté
              setUsbConnectedDevice({ ...data.device, isVirtual: false })
              setUsbVirtualDevice(null)
              
              // Recharger UNE SEULE FOIS après un délai (laisser le temps à la base)
              createTimeoutWithCleanup(() => {
                refetchDevices()
                invalidateCache()
              }, 1000)
            }
          } else {
            logger.warn('⚠️ [AUTO-SYNC] Échec, dispositif affiché comme virtuel')
          }
        } catch (err) {
          logger.error('❌ [AUTO-SYNC] Erreur:', err.message)
        }
      }
      
      autoSyncDevice()
    }
  }, [usbDeviceInfo?.sim_iccid, usbDeviceInfo?.device_serial, isConnected])
  // IMPORTANT: Ne surveiller QUE les identifiants USB (ICCID, Serial) et la connexion
  // PAS allDevices, pas usbConnectedDevice, pas usbVirtualDevice (causerait boucle infinie)
  // Les setters sont stables et n'ont pas besoin d'être dans les dépendances
  // ========== FIN SYNCHRONISATION USB ==========
  
  // Helper pour déterminer la source et le timestamp d'une donnée
  const getDataInfo = useCallback((usbValue, usbTimestamp, dbValue, dbTimestamp) => {
    // Vérifier explicitement !== null et !== undefined (pas != null qui exclut aussi 0 et false)
    if (usbValue !== null && usbValue !== undefined) {
      return {
        value: usbValue,
        source: 'usb',
        timestamp: usbTimestamp || usbStreamLastUpdate || usbDeviceInfo?.last_seen || null
      }
    } else if (dbValue !== null && dbValue !== undefined) {
      return {
        value: dbValue,
        source: 'database',
        timestamp: dbTimestamp || dbDeviceData?.last_seen || null
      }
    }
    return { value: null, source: null, timestamp: null }
  }, [usbStreamLastUpdate, usbDeviceInfo?.last_seen, dbDeviceData?.last_seen])
  
  // Helper pour formater l'heure
  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return null
    const date = new Date(timestamp)
    if (isNaN(date.getTime())) return 'Date invalide'
    
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDays = Math.floor(diffHour / 24)
    
    // Moins de 1 minute : secondes
    if (diffSec < 60) return `Il y a ${diffSec}s`
    
    // Moins de 1 heure : minutes
    if (diffMin < 60) return `Il y a ${diffMin}min`
    
    // Moins de 24h : heures et minutes
    if (diffHour < 24) {
      const remainingMin = diffMin % 60
      if (remainingMin > 0) {
        return `Il y a ${diffHour}h ${remainingMin}min`
      }
      return `Il y a ${diffHour}h`
    }
    
    // Au-delà de 24h : afficher la date complète (jour + heure)
    return date.toLocaleString('fr-FR', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    })
  }, [])
  
  // Le modem est toujours démarré par défaut dans le firmware
  // Si le dispositif envoie des données (RSSI, GPS), le modem est actif
  const modemStatus = useMemo(() => {
    if (isConnected && (usbStreamLastMeasurement?.rssi != null || usbDeviceInfo?.rssi != null || usbStreamLastMeasurement?.latitude != null)) {
      return 'running'
    }
    return isConnected ? 'starting' : 'stopped'
  }, [isConnected, usbStreamLastMeasurement?.rssi, usbDeviceInfo?.rssi, usbStreamLastMeasurement?.latitude])
  
  // Suivi des valeurs min/max
  const [minMaxValues, setMinMaxValues] = useState({
    flowrate: { min: null, max: null },
    battery: { min: null, max: null },
    rssi: { min: null, max: null }
  })

  // Charger les ports disponibles
  const loadAvailablePorts = useCallback(async () => {
    if (!isSupported) return
    
    setLoadingPorts(true)
    try {
      const ports = await navigator.serial.getPorts()
      const portList = ports.map((p, index) => ({
          id: `port-${index}`,
        label: getUsbDeviceLabel(p),
        port: p
      }))
      setAvailablePorts(portList)
    } catch (err) {
      logger.error('[DebugTab] Erreur chargement ports:', err)
    } finally {
      setLoadingPorts(false)
    }
  }, [isSupported])

  // Charger les ports au montage et périodiquement
  useEffect(() => {
    if (!isSupported) return
    
    loadAvailablePorts()
    // Recharger périodiquement (toutes les 5 secondes)
    const interval = setInterval(loadAvailablePorts, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, port, usbConnectedDevice, usbVirtualDevice])

  // La connexion automatique est maintenant gérée par UsbContext.js en permanence
  // Ce useEffect synchronise uniquement le port sélectionné avec le port connecté
  useEffect(() => {
    if (!isSupported) return
    
    // Synchroniser le port sélectionné avec le port connecté dans le contexte
    if (isConnected && port) {
      const syncPort = async () => {
        try {
          await loadAvailablePorts()
          const ports = await navigator.serial.getPorts()
          const portIndex = ports.findIndex(p => p === port)
          if (portIndex >= 0) {
            setSelectedPortId(`port-${portIndex}`)
          }
        } catch (err) {
          logger.debug('[DebugTab] Erreur synchronisation port:', err)
        }
      }
      syncPort()
    }
  }, [isSupported, isConnected, port, loadAvailablePorts])

  // Démarrer automatiquement le streaming dès qu'on est connecté et pas encore en streaming
  useEffect(() => {
    if (!isSupported || !isConnected || !port) return
    
    // Si on est connecté mais pas en streaming (ni en pause), démarrer automatiquement
    if (usbStreamStatus === 'idle' && !isToggling) {
      const autoStart = async () => {
        try {
          logger.debug('[USB] Auto-start streaming')
          await startUsbStreaming(port)
        } catch (err) {
          logger.error('[DebugTab] Erreur démarrage automatique streaming:', err)
        }
      }
      // Petit délai pour s'assurer que la connexion est bien établie
      const timeout = setTimeout(autoStart, 300)
      return () => clearTimeout(timeout)
    }
  }, [isSupported, isConnected, port, usbStreamStatus, isToggling, startUsbStreaming])

  // Charger les données de la base de données au démarrage (même sans USB)
  useEffect(() => {
    const loadDbDeviceData = async () => {
      // Si déjà chargé, ne pas recharger
      if (loadingDbData) return
      
      // Si on a un identifiant USB, l'utiliser, sinon charger tous les dispositifs
      const identifier = usbDeviceInfo?.sim_iccid || usbDeviceInfo?.device_serial || usbDeviceInfo?.device_name
      
      // Si on a déjà des données DB et un identifiant USB qui correspond, ne pas recharger
      if (dbDeviceData && identifier) {
        const matches = dbDeviceData.sim_iccid === identifier || 
                        dbDeviceData.device_serial === identifier || 
                        dbDeviceData.device_name === identifier
        if (matches) return
      }
      
      setLoadingDbData(true)
      try {
        // Chercher le dispositif dans la liste des dispositifs
        const response = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/devices',
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (response?.devices?.devices) {
          let device = null
          
          // Si on a un identifiant, chercher le dispositif correspondant
          if (identifier) {
            device = response.devices.devices.find((d) => 
              d.sim_iccid === identifier || 
              d.device_serial === identifier || 
              d.device_name === identifier
            )
          } else {
            // Sinon, prendre le premier dispositif disponible (pour affichage)
            device = response.devices.devices[0]
          }
          
          if (device) {
            setDbDeviceData({
              device_name: device.device_name,
              sim_iccid: device.sim_iccid,
              device_serial: device.device_serial,
              firmware_version: device.firmware_version,
              last_battery: device.last_battery || null,
              last_flowrate: device.last_flowrate || null,
              last_rssi: device.last_rssi || null,
              last_latitude: device.latitude || null,
              last_longitude: device.longitude || null,
              last_seen: device.last_seen,
              status: device.status
            })
            // Ne définir la source que si pas de données USB
            if (!usbStreamLastMeasurement && !usbDeviceInfo) {
              setDataSource('database')
            }
            if (process.env.NODE_ENV === 'development') {
              logger.debug('📦 Données DB chargées:', device.device_name)
            }
          }
        }
      } catch (err) {
        logger.error('[DebugTab] Erreur chargement données DB:', err)
      } finally {
        setLoadingDbData(false)
      }
    }
    
    // Charger immédiatement au montage
    loadDbDeviceData()
  }, [fetchWithAuth, API_URL])
  
  // Recharger si on obtient un identifiant USB qui ne correspond pas aux données DB actuelles
  useEffect(() => {
    const identifier = usbDeviceInfo?.sim_iccid || usbDeviceInfo?.device_serial || usbDeviceInfo?.device_name
    if (identifier) {
      // Vérifier si les données DB correspondent
      const matches = dbDeviceData && (
        dbDeviceData.sim_iccid === identifier || 
        dbDeviceData.device_serial === identifier || 
        dbDeviceData.device_name === identifier
      )
      
      if (!matches && !loadingDbData) {
        // Recharger avec l'identifiant USB
        const loadDbDeviceData = async () => {
          setLoadingDbData(true)
          try {
            const response = await fetchJson(
              fetchWithAuth,
              API_URL,
              '/api.php/devices',
              { method: 'GET' },
              { requiresAuth: true }
            )
            
            if (response?.devices?.devices) {
              const device = response.devices.devices.find((d) => 
                d.sim_iccid === identifier || 
                d.device_serial === identifier || 
                d.device_name === identifier
              )
              
              if (device) {
                setDbDeviceData({
                  device_name: device.device_name,
                  sim_iccid: device.sim_iccid,
                  device_serial: device.device_serial,
                  firmware_version: device.firmware_version,
                  last_battery: device.last_battery,
                  last_flowrate: device.last_flowrate || null,
                  last_rssi: device.last_rssi || null,
                  last_latitude: device.latitude || null,
                  last_longitude: device.longitude || null,
                  last_seen: device.last_seen,
                  status: device.status
                })
              }
            }
          } catch (err) {
            logger.error('[DebugTab] Erreur rechargement données DB:', err)
          } finally {
            setLoadingDbData(false)
          }
        }
        loadDbDeviceData()
      }
    }
  }, [usbDeviceInfo?.sim_iccid, usbDeviceInfo?.device_serial, usbDeviceInfo?.device_name, fetchWithAuth, API_URL, loadingDbData, dbDeviceData])
  
  // Mettre à jour la source des données : USB en priorité si disponible
  useEffect(() => {
    if (usbStreamLastMeasurement || (usbDeviceInfo && (usbDeviceInfo.flowrate != null || usbDeviceInfo.last_battery != null))) {
      setDataSource('usb')
    } else if (dbDeviceData && !usbStreamLastMeasurement) {
      setDataSource('database')
    }
  }, [usbStreamLastMeasurement, usbDeviceInfo, dbDeviceData])

  // Rafraîchir l'affichage de la dernière mise à jour toutes les secondes
  useEffect(() => {
    if (!isReady || !usbStreamLastUpdate) return
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isReady, usbStreamLastUpdate])

  // Envoyer une commande au dispositif
  const sendCommand = useCallback(async (command) => {
    if (!isConnected || !port) {
      appendUsbStreamLog('❌ Port non connecté - Connexion automatique en cours...', 'dashboard')
      return
    }
    if (sendingCommand) {
      appendUsbStreamLog('⏳ Commande déjà en cours...', 'dashboard')
      return
    }
    
    setSendingCommand(true)
    try {
      const commandWithNewline = command + '\n'
      appendUsbStreamLog(`📤 Envoi commande: ${command}`, 'dashboard')
      const result = await write(commandWithNewline)
      // Petit délai pour laisser le temps à l'écriture de se terminer
      await new Promise(resolve => {
        const timeoutId = createTimeoutWithCleanup(() => {
          resolve()
        }, 100)
        if (!timeoutId) {
          // Si le composant est démonté, résoudre immédiatement
          resolve()
        }
      })
      if (result) {
        appendUsbStreamLog(`✅ Commande "${command}" envoyée`, 'dashboard')
      } else {
        appendUsbStreamLog(`❌ Échec envoi commande: ${command}`, 'dashboard')
      }
    } catch (err) {
      logger.error('[DebugTab] Erreur envoi commande:', err)
      appendUsbStreamLog(`❌ Erreur envoi commande: ${err.message || err}`, 'dashboard')
    } finally {
      setSendingCommand(false)
    }
  }, [isConnected, port, sendingCommand, write, appendUsbStreamLog])

  // Toggle streaming (pause/reprise uniquement - le démarrage est automatique)
  const handleToggleStreaming = useCallback(async () => {
    if (isToggling) return
    setIsToggling(true)
    try {
      if (isStreaming) {
        // Mettre en pause si en cours
        pauseUsbStreaming()
        appendUsbStreamLog('⏸️ Visualisation des logs mise en pause - Port toujours connecté', 'dashboard')
      } else if (isPaused) {
        // Reprendre si en pause
        if (isConnected && port) {
          await startUsbStreaming(port)
          appendUsbStreamLog('▶️ Visualisation des logs reprise', 'dashboard')
        }
      } else {
        // Si arrêté (ne devrait pas arriver normalement), démarrer
        if (isConnected && port) {
          await startUsbStreaming(port)
        }
      }
    } catch (err) {
      logger.error('[DebugTab] Erreur toggle streaming:', err)
      appendUsbStreamLog(`❌ Erreur: ${err.message || err}`, 'dashboard')
    } finally {
      setIsToggling(false)
    }
  }, [isToggling, isStreaming, isPaused, isConnected, port, startUsbStreaming, pauseUsbStreaming, appendUsbStreamLog])

  // Mettre à jour min/max de manière optimisée
  useEffect(() => {
    if (!usbStreamLastMeasurement) return
    
    const { flowrate, battery, rssi } = usbStreamLastMeasurement
    
      setMinMaxValues(prev => {
        const newValues = { ...prev }
      let hasChanges = false
      
      if (flowrate != null) {
        if (newValues.flowrate.min === null || flowrate < newValues.flowrate.min) {
          newValues.flowrate.min = flowrate
          hasChanges = true
        }
        if (newValues.flowrate.max === null || flowrate > newValues.flowrate.max) {
          newValues.flowrate.max = flowrate
          hasChanges = true
        }
      }
      
      if (battery != null) {
        if (newValues.battery.min === null || battery < newValues.battery.min) {
          newValues.battery.min = battery
          hasChanges = true
        }
        if (newValues.battery.max === null || battery > newValues.battery.max) {
          newValues.battery.max = battery
          hasChanges = true
        }
      }
      
      if (rssi != null && rssi !== -999) {
        if (newValues.rssi.min === null || rssi < newValues.rssi.min) {
          newValues.rssi.min = rssi
          hasChanges = true
        }
        if (newValues.rssi.max === null || rssi > newValues.rssi.max) {
          newValues.rssi.max = rssi
          hasChanges = true
        }
      }
      
      return hasChanges ? newValues : prev
    })
  }, [usbStreamLastMeasurement])
  
  useEffect(() => {
    if (usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting') {
      setMinMaxValues({ flowrate: { min: null, max: null }, battery: { min: null, max: null }, rssi: { min: null, max: null } })
    }
  }, [usbStreamStatus])

  // Note: modemStatus est maintenant calculé via useMemo basé sur les données reçues
  // Plus besoin de détecter depuis les logs - optimisation

  // Handlers pour les actions (simplifiés - uniquement modem pour économie d'énergie)
  // Fonctions handleModemOn/handleModemOff supprimées - le modem démarre automatiquement

  // Composant pour une ligne d'action dans le tableau (simplifié - données uniquement)
  const ActionRow = ({ icon, label, value, colorClass }) => (
    <tr className="table-row hover:bg-gray-50 dark:hover:bg-gray-800">
      <td className="table-cell px-4 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        </div>
      </td>
      <td className="table-cell px-4 py-1.5">
        <span className={`text-sm font-semibold ${colorClass || 'text-gray-600 dark:text-gray-400'}`}>
          {value}
        </span>
      </td>
    </tr>
  )

  // Fonction pour supprimer un dispositif
  const handleArchiveDevice = useCallback(async (device) => {
    setDeleting(true)
    try {
      const isAdmin = user?.role_name === 'admin'
      const url = isAdmin 
        ? `/api.php/devices/${device.id}?archive=true`
        : `/api.php/devices/${device.id}`
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        url,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      
      if (response.success) {
        logger.log(`✅ Dispositif "${device.device_name || device.sim_iccid}" archivé`)
        appendUsbStreamLog(`✅ Dispositif "${device.device_name || device.sim_iccid}" archivé`, 'dashboard')
        setSuccessMessage('✅ Dispositif archivé')
        // Debounce pour éviter les refetch multiples rapides qui causent des sauts visuels
        invalidateCache()
        createTimeoutWithCleanup(() => {
          refetchDevices()
        }, 500)
        createTimeoutWithCleanup(() => setSuccessMessage(null), 5000)
      } else {
        logger.error('Erreur archivage dispositif:', response.error)
        appendUsbStreamLog(`❌ Erreur archivage: ${response.error}`, 'dashboard')
      }
    } catch (err) {
      logger.error('Erreur archivage dispositif:', err)
      appendUsbStreamLog(`❌ Erreur archivage: ${err.message || err}`, 'dashboard')
    } finally {
      setDeleting(false)
    }
  }, [fetchWithAuth, API_URL, refetchDevices, appendUsbStreamLog, user, createTimeoutWithCleanup, setSuccessMessage])
  
  const handlePermanentDeleteDevice = useCallback(async (device) => {
    setDeleting(true)
    try {
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}?permanent=true`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      
      if (response.success) {
        logger.log(`✅ Dispositif "${device.device_name || device.sim_iccid}" supprimé définitivement`)
        appendUsbStreamLog(`✅ Dispositif "${device.device_name || device.sim_iccid}" supprimé définitivement`, 'dashboard')
        setSuccessMessage('✅ Dispositif supprimé définitivement')
        // Debounce pour éviter les refetch multiples rapides
        invalidateCache()
        createTimeoutWithCleanup(() => {
          refetchDevices()
        }, 300)
        createTimeoutWithCleanup(() => setSuccessMessage(null), 5000)
      } else {
        logger.error('Erreur suppression dispositif:', response.error)
        appendUsbStreamLog(`❌ Erreur suppression: ${response.error}`, 'dashboard')
      }
    } catch (err) {
      logger.error('Erreur suppression dispositif:', err)
      appendUsbStreamLog(`❌ Erreur suppression: ${err.message || err}`, 'dashboard')
    } finally {
      setDeleting(false)
    }
  }, [fetchWithAuth, API_URL, refetchDevices, appendUsbStreamLog, createTimeoutWithCleanup, setSuccessMessage])
  
  // Plus de modal - actions directes
  
  
  // Créer les dispositifs fictifs
  const [creatingTestDevices, setCreatingTestDevices] = useState(false)
  const handleCreateTestDevices = useCallback(async () => {
    setCreatingTestDevices(true)
    try {
      // Utiliser directement fetchWithAuth avec l'URL complète
      const url = `${API_URL}/api.php/devices/test/create`
      const response = await fetchWithAuth(url, { method: 'POST' }, { requiresAuth: true })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
      }
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Erreur API')
      }
      
      if (response.success) {
        logger.log(`✅ ${data.message}`)
        appendUsbStreamLog(`✅ ${data.message}`, 'dashboard')
        if (data.errors && data.errors.length > 0) {
          data.errors.forEach(err => {
            appendUsbStreamLog(`⚠️ ${err}`, 'dashboard')
          })
        }
        // Recharger la liste des dispositifs
        refetchDevices()
      } else {
        logger.error('Erreur création dispositifs fictifs:', data.error)
        appendUsbStreamLog(`❌ Erreur: ${data.error}`, 'dashboard')
      }
    } catch (err) {
      logger.error('Erreur création dispositifs fictifs:', err)
      appendUsbStreamLog(`❌ Erreur: ${err.message || err}`, 'dashboard')
    } finally {
      setCreatingTestDevices(false)
    }
  }, [fetchWithAuth, API_URL, refetchDevices, appendUsbStreamLog])
  
  // Gérer la création d'un dispositif
  
  // Gérer l'assignation d'un patient à un dispositif
  const handleAssignPatient = useCallback(async (patientId) => {
    if (!deviceToAssign || !patientId) return
    
    setAssigningPatient(true)
    try {
      const url = `${API_URL}/api.php/devices/${deviceToAssign.id}`
      const response = await fetchWithAuth(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId })
      }, { requiresAuth: true })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
      }
      
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Erreur API')
      }
      
      const patient = allPatients.find(p => p.id === patientId)
      logger.log(`✅ Dispositif assigné à ${patient?.first_name} ${patient?.last_name || patientId}`)
      appendUsbStreamLog(`✅ Dispositif assigné à ${patient?.first_name} ${patient?.last_name || patientId}`, 'dashboard')
      setShowAssignPatientModal(false)
      setDeviceToAssign(null)
      refetchDevices()
    } catch (err) {
      logger.error('Erreur assignation patient:', err)
      appendUsbStreamLog(`❌ Erreur assignation patient: ${err.message || err}`, 'dashboard')
    } finally {
      setAssigningPatient(false)
    }
  }, [fetchWithAuth, API_URL, deviceToAssign, allPatients, appendUsbStreamLog, refetchDevices])
  
  // Gérer la désassignation d'un patient d'un dispositif
  const handleUnassignPatient = useCallback(async (device) => {
    if (!device) return
    
    setUnassigningPatient(device.id)
    try {
      // 1. Désassigner le dispositif (mettre patient_id à null)
      const url = `${API_URL}/api.php/devices/${device.id}`
      const response = await fetchWithAuth(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: null })
      }, { requiresAuth: true })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
      }
      
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Erreur API')
      }
      
      // 2. Réinitialiser la configuration du dispositif aux paramètres d'origine
      try {
        await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/devices/${device.id}/config`,
          {
            method: 'PUT',
            body: JSON.stringify({
              sleep_minutes: null,
              measurement_duration_ms: null,
              send_every_n_wakeups: null,
              calibration_coefficients: null
            })
          },
          { requiresAuth: true }
        )
      } catch (configErr) {
        // Ne pas bloquer si la réinitialisation de la config échoue
        logger.warn('Erreur réinitialisation config dispositif:', configErr)
      }
      
      const patient = allPatients.find(p => p.id === device.patient_id)
      logger.log(`✅ Dispositif "${device.device_name || device.sim_iccid}" désassigné${patient ? ` de ${patient.first_name} ${patient.last_name}` : ''}`)
      appendUsbStreamLog(`✅ Dispositif "${device.device_name || device.sim_iccid}" désassigné et réinitialisé`, 'dashboard')
      setShowUnassignPatientModal(false)
      setDeviceToUnassign(null)
      setSuccessMessage('✅ Dispositif désassigné et réinitialisé avec succès')
      invalidateCache()
      createTimeoutWithCleanup(async () => {
        await refetchDevices()
      }, 500)
      createTimeoutWithCleanup(() => setSuccessMessage(null), 5000)
    } catch (err) {
      logger.error('Erreur désassignation patient:', err)
      appendUsbStreamLog(`❌ Erreur désassignation: ${err.message || err}`, 'dashboard')
    } finally {
      setUnassigningPatient(null)
    }
  }, [fetchWithAuth, API_URL, allPatients, appendUsbStreamLog, refetchDevices, invalidateCache, createTimeoutWithCleanup, setSuccessMessage])
  
  // Patients disponibles (sans dispositif assigné et non archivés)
  const availablePatients = useMemo(() => {
    const assignedPatientIds = new Set(allDevices.filter(d => d.patient_id).map(d => d.patient_id))
    return allPatients.filter(p => !isArchived(p) && !assignedPatientIds.has(p.id))
  }, [allPatients, allDevices])
  
  // Gérer l'ouverture du modal d'assignation de patient
  const handleOpenAssignPatientModal = useCallback((device) => {
    if (isArchived(device)) {
      logger.warn('Tentative d\'assignation d\'un patient à un dispositif archivé')
      return
    }
    setDeviceToAssign(device)
    setShowAssignPatientModal(true)
  }, [])
  
  // Gérer l'ouverture du modal de désassignation de patient
  const handleOpenUnassignPatientModal = useCallback((device) => {
    if (isArchived(device)) {
      logger.warn('Tentative de désassignation d\'un patient d\'un dispositif archivé')
      return
    }
    setDeviceToUnassign(device)
    setShowUnassignPatientModal(true)
  }, [])
  
  // Gérer l'ouverture du modal de flash (uniquement pour dispositifs non archivés)
  const handleOpenFlashModal = useCallback((device) => {
    // Ne pas ouvrir le modal pour les dispositifs archivés
    if (isArchived(device)) {
      logger.warn('Tentative de flash d\'un dispositif archivé')
      return
    }
    setDeviceToFlash(device)
    setShowFlashModal(true)
  }, [])

  return (
    <div className="space-y-6">
      {/* Message de succès */}
      {successMessage && (
        <SuccessMessage 
          message={successMessage} 
          onDismiss={() => setSuccessMessage(null)} 
        />
      )}
      
      {/* Modal d'assignation de patient */}
      <Modal
        isOpen={showAssignPatientModal}
        onClose={() => {
          setShowAssignPatientModal(false)
          setDeviceToAssign(null)
        }}
        title={deviceToAssign ? `🔗 Assigner un patient à ${deviceToAssign.device_name || deviceToAssign.sim_iccid || deviceToAssign.device_serial || `Dispositif #${deviceToAssign.id}`}` : 'Assigner un patient au dispositif'}
        maxWidth="max-w-md"
      >
        {deviceToAssign && (
          <>
            {patientsLoading ? (
              <div className="text-center py-4">
                <p className="text-gray-600 dark:text-gray-400">
                  Chargement des patients...
                </p>
              </div>
            ) : availablePatients.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Aucun patient disponible
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
                  Tous les patients ont déjà un dispositif assigné
                </p>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowAssignPatientModal(false)
                    setDeviceToAssign(null)
                  }}
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
                    Sélectionner un patient libre :
                  </label>
                  <select
                    id="patient-select"
                    className="input w-full"
                    defaultValue=""
                  >
                    <option value="">— Sélectionner un patient —</option>
                    {availablePatients.map(patient => (
                      <option key={patient.id} value={patient.id}>
                        {patient.first_name} {patient.last_name} {patient.email ? `(${patient.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setShowAssignPatientModal(false)
                      setDeviceToAssign(null)
                    }}
                    disabled={assigningPatient}
                  >
                    Annuler
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const select = document.getElementById('patient-select')
                      const patientId = select ? parseInt(select.value, 10) : null
                      if (patientId) {
                        handleAssignPatient(patientId)
                      } else {
                        logger.warn('Veuillez sélectionner un patient')
                        appendUsbStreamLog('⚠️ Veuillez sélectionner un patient', 'dashboard')
                      }
                    }}
                    disabled={assigningPatient}
                  >
                    {assigningPatient ? '⏳ Assignation...' : '🔗 Assigner'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </Modal>
      
      {/* Modal de confirmation de désassignation de patient */}
      <ConfirmModal
        isOpen={showUnassignPatientModal}
        onClose={() => {
          setShowUnassignPatientModal(false)
          setDeviceToUnassign(null)
        }}
        title="🔓 Désassigner le patient"
        onConfirm={() => {
          if (deviceToUnassign) {
            handleUnassignPatient(deviceToUnassign)
          }
        }}
        confirmText={unassigningPatient ? '⏳ Désassignation...' : '🔓 Désassigner'}
        cancelText="Annuler"
        disabled={unassigningPatient}
      >
        {deviceToUnassign && (
          <>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Êtes-vous sûr de vouloir désassigner le dispositif :
            </p>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-4">
              <p className="font-semibold text-gray-900 dark:text-gray-100">
                {deviceToUnassign.device_name || deviceToUnassign.sim_iccid}
              </p>
              {deviceToUnassign.sim_iccid && (
                <p className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                  {deviceToUnassign.sim_iccid}
                </p>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              La configuration du dispositif sera réinitialisée aux paramètres d'origine.
            </p>
          </>
        )}
      </ConfirmModal>
      
      {/* Modal de confirmation de suppression */}
      {/* Modal de flash */}
      <FlashModal
        isOpen={showFlashModal}
        onClose={() => {
          setShowFlashModal(false)
          setDeviceToFlash(null)
        }}
        device={deviceToFlash}
        flashMode={deviceToFlash && isConnected && (
          usbDeviceInfo?.sim_iccid === deviceToFlash.sim_iccid ||
          usbDeviceInfo?.device_serial === deviceToFlash.device_serial
        ) ? 'usb' : 'ota'}
      />
      
      {/* Modal pour l'historique des mesures */}
      <DeviceMeasurementsModal
        isOpen={showMeasurementsModal}
        onClose={() => {
          setShowMeasurementsModal(false)
          setDeviceForMeasurements(null)
        }}
        device={deviceForMeasurements}
      />
      
      {/* Modal unifié pour création et modification (comme pour patients et utilisateurs) */}
      <DeviceModal
        isOpen={showDeviceModal}
        onClose={() => {
          setShowDeviceModal(false)
          setEditingDevice(null)
        }}
        editingItem={editingDevice || (usbDeviceInfo && !editingDevice ? {
          // Pré-remplir depuis USB si création et données USB disponibles (sans id = pré-remplissage)
          sim_iccid: usbDeviceInfo.sim_iccid || '',
          device_serial: usbDeviceInfo.device_serial || '',
          device_name: usbDeviceInfo.device_name || '',
          firmware_version: usbDeviceInfo.firmware_version || ''
        } : null)} // null = création vide, objet sans id = pré-remplissage USB, objet avec id = modification
        onSave={() => {
          setShowDeviceModal(false)
          const action = editingDevice ? 'mis à jour' : 'créé'
          const name = editingDevice?.device_name || editingDevice?.sim_iccid || usbDeviceInfo?.device_name || usbDeviceInfo?.sim_iccid || 'nouveau dispositif'
          refetchDevices()
          appendUsbStreamLog(`✅ Dispositif "${name}" ${action}`, 'dashboard')
          setEditingDevice(null)
        }}
        fetchWithAuth={fetchWithAuth}
        API_URL={API_URL}
        patients={allPatients}
        allDevices={allDevices}
        appendLog={appendUsbStreamLog}
      />
      
      {/* Plus de modal - actions directes selon le rôle */}

      <div className="card">
        {!isSupported && (
          <div className="alert alert-warning mb-4">
            Le navigateur utilisé ne supporte pas l&apos;API Web Serial. Utilisez Chrome ou Edge (desktop).
          </div>
        )}

        {usbStreamError && (
          <div className="alert alert-warning mb-4">
            {usbStreamError}
          </div>
        )}

        {/* Indicateur de source des données et statut USB */}
        <div className="mb-4 space-y-2">
          
        </div>

        {/* Tableau des données - Affiche tous les dispositifs - TOUJOURS VISIBLE */}
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex-1">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2 mb-2">
              <span className="text-lg">🔌</span>
              Dispositifs
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Dernières valeurs enregistrées en base de données.
            </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  🗄️ Afficher les archives
                </span>
              </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            {devicesLoading ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Chargement des dispositifs...
              </div>
            ) : (
              <>
                <table className="w-full border-collapse bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Identifiant</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Patient</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Firmware</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Modem</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">GPS</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Débit</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Batterie</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">RSSI</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Mesures</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Dernière mise à jour</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* AFFICHER LE DISPOSITIF VIRTUEL USB temporairement (pendant l'enregistrement) */}
                    {usbVirtualDevice && !allDevices.find(d => 
                      d.sim_iccid === usbVirtualDevice.sim_iccid || 
                      d.device_serial === usbVirtualDevice.device_serial
                    ) && (
                      <tr key={usbVirtualDevice.id} className="table-row bg-blue-50 dark:bg-blue-900/20 animate-pulse hover:bg-blue-100 dark:hover:bg-blue-900/30">
                        <td className="table-cell px-3 py-3 text-sm text-gray-900 dark:text-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="text-blue-500 text-lg animate-spin">⏳</span>
                            <span className="font-medium">{usbVirtualDevice.device_name}</span>
                            <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded">Enregistrement automatique...</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            ICCID: {usbVirtualDevice.sim_iccid || 'N/A'}
                          </div>
                        </td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">-</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{usbVirtualDevice.firmware_version || 'N/A'}</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">USB</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">-</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{usbStreamLastMeasurement?.flowrate?.toFixed(2) || '-'}</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{usbStreamLastMeasurement?.battery?.toFixed(0) || '-'}%</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{usbStreamLastMeasurement?.rssi || '-'}</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">{usbStreamMeasurements.length}</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">Temps réel</td>
                        <td className="table-cell px-3 py-3 text-sm text-gray-500 dark:text-gray-400">
                          <span className="text-xs text-gray-500 italic">Auto...</span>
                        </td>
                      </tr>
                    )}
                    
                    {allDevices.length === 0 && !usbVirtualDevice ? (
                      <tr className="table-row hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td colSpan="11" className="table-cell px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                          <div className="flex flex-col items-center gap-3">
                            <span className="text-4xl">🔌</span>
                            <p className="text-sm font-medium">Aucun dispositif enregistré</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              Connectez un dispositif USB pour l&apos;enregistrer automatiquement
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      devicesToDisplay.map((device) => {
                  const deviceIsArchived = isArchived(device)
                  // Vérifier si ce dispositif est connecté en USB (données temps réel)
                  const isDeviceUsbConnected = isConnected && (
                    usbDeviceInfo?.sim_iccid === device.sim_iccid ||
                    usbDeviceInfo?.device_serial === device.device_serial ||
                    usbConnectedDevice?.id === device.id
                  )
                  const isDeviceUsbVirtual = usbVirtualDevice && (
                    usbVirtualDevice.sim_iccid === device.sim_iccid ||
                    usbVirtualDevice.device_serial === device.device_serial
                  )
                  
                  // Utiliser les données USB si ce dispositif est connecté, sinon DB
                  const deviceUsbInfo = isDeviceUsbConnected ? usbDeviceInfo : null
                  const deviceUsbMeasurement = isDeviceUsbConnected ? usbStreamLastMeasurement : null
                  const deviceDbData = device
                  
                  return (
                    <tr key={device.id} className={`table-row hover:bg-gray-50 dark:hover:bg-gray-800 ${deviceIsArchived ? 'opacity-60' : ''}`}>
                {/* Identifiant */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    const deviceName = deviceUsbInfo?.device_name || deviceDbData?.device_name
                    const identifier = deviceUsbInfo?.sim_iccid || deviceUsbInfo?.device_serial || deviceDbData?.sim_iccid || deviceDbData?.device_serial
                    const source = deviceUsbInfo?.device_name ? 'usb' : (deviceDbData?.device_name ? 'database' : null)
                    const timestamp = deviceUsbInfo?.last_seen || deviceDbData?.last_seen
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-semibold ${!deviceName ? 'text-gray-400 dark:text-gray-500' : 'text-orange-600 dark:text-orange-400'}`}>
                            {deviceName || 'N/A'}
                          </span>
                          {deviceIsArchived && (
                            <span className="ml-2 badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">🗄️ Archivé</span>
                          )}
                          {isDeviceUsbConnected && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-green-500 text-white rounded animate-pulse">
                              <span className="w-1 h-1 bg-white rounded-full"></span>
                              LIVE
                            </span>
                          )}
                        </div>
                        {identifier && (
                          <span className={`text-xs font-mono text-gray-600 dark:text-gray-400`}>
                            {identifier}
                          </span>
                        )}
                        {timestamp && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(timestamp)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Patient */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    const patientName = deviceDbData?.first_name && deviceDbData?.last_name 
                      ? `${deviceDbData.first_name} ${deviceDbData.last_name}` 
                      : null
                    const hasPatient = !!patientName
                    return (
                      <div className="flex items-center gap-1">
                        {hasPatient ? (
                          <span className="badge badge-success text-xs">{patientName}</span>
                        ) : (
                          <span className={`badge ${deviceIsArchived ? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300'} text-xs`}>
                            Non assigné
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Firmware - USB en priorité, puis DB */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    const firmwareVersion = deviceUsbMeasurement?.raw?.firmware_version || deviceUsbMeasurement?.firmware_version || deviceUsbInfo?.firmware_version || deviceDbData?.firmware_version
                    const source = deviceUsbMeasurement?.firmware_version || deviceUsbInfo?.firmware_version ? 'usb' : (deviceDbData?.firmware_version ? 'database' : null)
                    const timestamp = deviceUsbMeasurement?.timestamp || deviceUsbInfo?.last_seen || deviceDbData?.last_seen
                    const canFlash = compiledFirmwares.length > 0
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          {deviceIsArchived ? (
                            <span className={`text-xs font-semibold ${!firmwareVersion ? 'text-gray-400 dark:text-gray-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                              {firmwareVersion || 'N/A'}
                            </span>
                          ) : canFlash ? (
                            <button
                              onClick={() => handleOpenFlashModal(device)}
                              className={`text-xs font-semibold hover:underline transition-colors ${!firmwareVersion ? 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300' : 'text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 cursor-pointer'}`}
                              title="Cliquer pour flasher un firmware"
                            >
                              {firmwareVersion || 'N/A'}
                            </button>
                          ) : (
                            <span className={`text-xs font-semibold ${!firmwareVersion ? 'text-gray-400 dark:text-gray-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                              {firmwareVersion || 'N/A'}
                            </span>
                          )}
                        </div>
                        {firmwareVersion && timestamp && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(timestamp)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Modem */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    const hasModemData = (deviceUsbMeasurement?.rssi != null && deviceUsbMeasurement?.rssi !== -999) || 
                                        (deviceUsbInfo?.rssi != null && deviceUsbInfo?.rssi !== -999) ||
                                        (deviceUsbMeasurement?.latitude != null) ||
                                        (deviceUsbInfo?.latitude != null) ||
                                        (deviceDbData?.last_rssi != null && deviceDbData?.last_rssi !== -999)
                    const source = (deviceUsbMeasurement?.rssi != null || deviceUsbInfo?.rssi != null || deviceUsbMeasurement?.latitude != null || deviceUsbInfo?.latitude != null) ? 'usb' : (deviceDbData?.last_rssi != null ? 'database' : null)
                    const timestamp = deviceUsbMeasurement?.timestamp || deviceUsbInfo?.last_seen || deviceDbData?.last_seen
                    const deviceModemStatus = isDeviceUsbConnected && hasModemData ? 'running' : (isDeviceUsbConnected ? 'starting' : 'stopped')
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${deviceModemStatus === 'running' ? 'text-green-600 dark:text-green-400' : deviceModemStatus === 'starting' ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-500'}`}>
                            {deviceModemStatus === 'running' ? 'Actif' : deviceModemStatus === 'starting' ? 'Démarrage...' : 'Arrêté'}
                          </span>
                        </div>
                        {hasModemData && timestamp && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(timestamp)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* GPS - Statut ON/OFF/N/A + Coordonnées */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    // Priorité : deviceUsbMeasurement > deviceUsbInfo > deviceDbData
                    const usbLat = deviceUsbMeasurement?.latitude ?? deviceUsbInfo?.latitude
                    const usbLon = deviceUsbMeasurement?.longitude ?? deviceUsbInfo?.longitude
                    const latInfo = getDataInfo(
                      usbLat,
                      deviceUsbMeasurement?.timestamp,
                      deviceDbData?.latitude,
                      deviceDbData?.last_seen
                    )
                    const lonInfo = getDataInfo(
                      usbLon,
                      deviceUsbMeasurement?.timestamp,
                      deviceDbData?.longitude,
                      deviceDbData?.last_seen
                    )
                    const lat = latInfo.value ?? usbLat ?? deviceDbData?.latitude ?? null
                    const lon = lonInfo.value ?? usbLon ?? deviceDbData?.longitude ?? null
                    const hasCoordinates = lat != null && lon != null && lat !== 0 && lon !== 0 && !isNaN(lat) && !isNaN(lon)
                    const gpsEnabled = deviceDbData?.gps_enabled ?? false
                    const source = latInfo.source || lonInfo.source || (usbLat != null ? 'usb' : null)
                    const timestamp = latInfo.timestamp || lonInfo.timestamp || deviceUsbMeasurement?.timestamp
                    
                    // Déterminer le statut GPS
                    let status, statusColor, statusText
                    if (gpsEnabled) {
                      if (hasCoordinates) {
                        status = 'ON'
                        statusColor = 'text-green-600 dark:text-green-400'
                        statusText = `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}`
                      } else {
                        status = 'N/A'
                        statusColor = 'text-yellow-600 dark:text-yellow-400'
                        statusText = 'GPS activé, fix en cours...'
                      }
                    } else {
                      status = 'OFF'
                      statusColor = 'text-gray-400 dark:text-gray-500'
                      statusText = 'Désactivé'
                    }
                    
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${statusColor}`}>
                            {status === 'ON' ? statusText : `${status}: ${statusText}`}
                          </span>
                        </div>
                        {hasCoordinates && timestamp && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(timestamp)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Débit - USB en priorité */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    // Priorité : deviceUsbMeasurement > deviceUsbInfo > deviceDbData
                    const usbFlowrate = deviceUsbMeasurement?.flowrate ?? deviceUsbInfo?.flowrate
                    const flowrateInfo = getDataInfo(
                      usbFlowrate,
                      deviceUsbMeasurement?.timestamp,
                      deviceDbData?.last_flowrate,
                      deviceDbData?.last_seen
                    )
                    const flowrate = flowrateInfo.value ?? usbFlowrate ?? deviceDbData?.last_flowrate ?? null
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${flowrate == null || isNaN(flowrate) ? 'text-gray-400 dark:text-gray-500' : 'text-blue-600 dark:text-blue-400'}`}>
                            {flowrate != null && !isNaN(flowrate) ? `${Number(flowrate).toFixed(2)} L/min` : 'N/A'}
                          </span>
                        </div>
                        {flowrate != null && !isNaN(flowrate) && (flowrateInfo.timestamp || deviceUsbMeasurement?.timestamp || deviceDbData?.last_seen) && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(flowrateInfo.timestamp || deviceUsbMeasurement?.timestamp || deviceDbData?.last_seen)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Batterie - USB en priorité */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    // Priorité : deviceUsbMeasurement > deviceUsbInfo > deviceDbData
                    const usbBattery = deviceUsbMeasurement?.battery ?? deviceUsbInfo?.last_battery
                    const batteryInfo = getDataInfo(
                      usbBattery,
                      deviceUsbMeasurement?.timestamp,
                      deviceDbData?.last_battery,
                      deviceDbData?.last_seen
                    )
                    const battery = batteryInfo.value ?? usbBattery ?? deviceDbData?.last_battery ?? null
                    const batteryValue = (battery != null && !isNaN(battery)) ? battery : 0
                    const colorClass = battery == null || isNaN(battery) 
                      ? 'text-gray-400 dark:text-gray-500'
                      : batteryValue >= 50 
                        ? 'text-green-600 dark:text-green-400'
                        : batteryValue >= 20 
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${colorClass}`}>
                            {battery != null && !isNaN(battery) ? `${Number(batteryValue).toFixed(0)}%` : 'N/A'}
                          </span>
                        </div>
                        {battery != null && !isNaN(battery) && (batteryInfo.timestamp || deviceUsbMeasurement?.timestamp || deviceDbData?.last_seen) && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(batteryInfo.timestamp || deviceUsbMeasurement?.timestamp || deviceDbData?.last_seen)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* RSSI - USB en priorité */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    // Priorité : deviceUsbMeasurement > deviceUsbInfo > deviceDbData
                    const usbRssi = deviceUsbMeasurement?.rssi ?? deviceUsbInfo?.rssi
                    const rssiInfo = getDataInfo(
                      usbRssi,
                      deviceUsbMeasurement?.timestamp,
                      deviceDbData?.last_rssi,
                      deviceDbData?.last_seen
                    )
                    const rssi = rssiInfo.value ?? usbRssi ?? deviceDbData?.last_rssi ?? null
                    const hasRssi = rssi != null && rssi !== -999 && !isNaN(rssi)
                    const colorClass = !hasRssi
                      ? 'text-gray-400 dark:text-gray-500'
                      : rssi >= -70
                        ? 'text-green-600 dark:text-green-400'
                        : rssi >= -90
                          ? 'text-yellow-600 dark:text-yellow-400'
                          : 'text-red-600 dark:text-red-400'
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${colorClass}`}>
                            {hasRssi ? `${Number(rssi)} dBm` : 'N/A'}
                          </span>
                        </div>
                        {hasRssi && (rssiInfo.timestamp || deviceUsbMeasurement?.timestamp || deviceDbData?.last_seen) && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(rssiInfo.timestamp || deviceUsbMeasurement?.timestamp || deviceDbData?.last_seen)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Mesures reçues */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    const usbCount = isDeviceUsbConnected ? (usbStreamMeasurements?.length || 0) : 0
                    const dbCount = deviceDbData ? 1 : 0  // Si données DB, au moins 1 mesure
                    const count = usbCount || dbCount
                    const source = usbCount > 0 ? 'usb' : (dbCount > 0 ? 'database' : null)
                    return (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              setDeviceForMeasurements(device)
                              setShowMeasurementsModal(true)
                            }}
                            className={`text-xs font-semibold hover:underline transition-colors ${
                              count === 0 
                                ? 'text-gray-400 dark:text-gray-500 cursor-not-allowed' 
                                : 'text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 cursor-pointer'
                            }`}
                            disabled={count === 0}
                            title={count === 0 ? 'Aucune mesure enregistrée' : 'Voir l\'historique des mesures'}
                          >
                            {count}
                          </button>
                          {count > 0 && (
                            <span className="text-xs text-purple-500" title="Voir l'historique">📊</span>
                          )}
                        </div>
                        {isDeviceUsbConnected && deviceUsbMeasurement?.timestamp && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(deviceUsbMeasurement.timestamp)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Dernière mise à jour */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    const usbTimestamp = isDeviceUsbConnected ? (usbStreamLastUpdate || deviceUsbMeasurement?.timestamp || deviceUsbInfo?.last_seen) : null
                    const dbTimestamp = deviceDbData?.last_seen
                    const timestamp = usbTimestamp || dbTimestamp
                    
                    if (!timestamp) {
                      return (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Jamais</span>
                      )
                    }
                    
                    // Vérifier si timestamp est valide
                    const date = new Date(timestamp)
                    const isValidDate = !isNaN(date.getTime())
                    
                    if (!isValidDate) {
                      return (
                        <span className="text-xs text-gray-400 dark:text-gray-500">Date invalide</span>
                      )
                    }
                    
                    // Afficher la date/heure complète avec secondes
                    return (
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        {date.toLocaleString('fr-FR', { 
                          day: '2-digit', 
                          month: '2-digit', 
                          year: 'numeric',
                          hour: '2-digit', 
                          minute: '2-digit',
                          second: '2-digit'
                        })}
                      </span>
                    )
                  })()}
                </td>
                
                {/* Actions */}
                <td className="table-cell px-3 py-1.5">
                  <div className="flex items-center justify-end gap-2">
                    {deviceIsArchived ? (
                      // Dispositifs archivés : uniquement l'icône de restauration
                      <button
                        onClick={() => handleRestoreDeviceDirect(device)}
                        disabled={restoringDevice === device.id}
                        className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                        title="Restaurer le dispositif"
                      >
                        <span className="text-lg">{restoringDevice === device.id ? '⏳' : '♻️'}</span>
                      </button>
                    ) : (
                      // Dispositifs actifs : toutes les actions disponibles
                      <>
                        <button
                          onClick={() => {
                            setEditingDevice(device)
                            setShowDeviceModal(true)
                          }}
                          className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="Modifier le dispositif (données et configuration)"
                        >
                          <span className="text-lg">✏️</span>
                        </button>
                        {(() => {
                          const hasPatient = !!deviceDbData?.patient_id
                          if (hasPatient) {
                            // Dispositif assigné : bouton désassigner
                            return (
                              <button
                                className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                onClick={() => handleOpenUnassignPatientModal(device)}
                                disabled={unassigningPatient}
                                title="Désassigner le patient du dispositif"
                              >
                                <span className="text-lg">{unassigningPatient ? '⏳' : '🔓'}</span>
                              </button>
                            )
                          } else {
                            // Pas de patient : bouton assigner
                            return (
                              <button
                                className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                                onClick={() => handleOpenAssignPatientModal(device)}
                                disabled={availablePatients.length === 0 || assigningPatient}
                                title={availablePatients.length === 0 ? "Aucun patient libre disponible" : "Assigner un patient au dispositif"}
                              >
                                <span className="text-lg">🔗</span>
                              </button>
                            )
                          }
                        })()}
                        <button
                          onClick={() => handleOpenFlashModal(device)}
                          disabled={compiledFirmwares.length === 0}
                          className="p-2 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={compiledFirmwares.length === 0 ? 'Aucun firmware compilé disponible. Compilez d\'abord un firmware dans l\'onglet "Upload INO".' : 'Flasher le firmware'}
                        >
                          <span className="text-lg">🚀</span>
                        </button>
                        {hasPermission('devices.edit') && (
                          <>
                            {/* Administrateurs : Archive + Suppression définitive */}
                            {user?.role_name === 'admin' ? (
                              <>
                                <button
                                  onClick={() => handleArchiveDevice(device)}
                                  disabled={deleting}
                                  className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Archiver le dispositif"
                                >
                                  <span className="text-lg">{deleting ? '⏳' : '🗄️'}</span>
                                </button>
                                <button
                                  onClick={() => handlePermanentDeleteDevice(device)}
                                  disabled={deleting}
                                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Supprimer définitivement le dispositif"
                                >
                                  <span className="text-lg">{deleting ? '⏳' : '🗑️'}</span>
                                </button>
                              </>
                            ) : (
                              /* Non-administrateurs : Archive uniquement (pas de suppression définitive) */
                              <button
                                onClick={() => handleArchiveDevice(device)}
                                disabled={deleting}
                                className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Archiver le dispositif"
                              >
                                <span className="text-lg">{deleting ? '⏳' : '🗄️'}</span>
                              </button>
                            )}
                          </>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
              )
            })
            )}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>

        {/* Console de logs USB */}
        <div className="mb-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  📡 Console de Logs USB
                </h2>
                {/* Statut USB inline */}
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  isConnected 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                }`}>
                  {isConnected ? 'USB Connecté' : 'USB Déconnecté'}
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Logs en temps réel du streaming USB et des actions du dashboard
              </p>
            </div>
            
            {/* Boutons d'action console */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (usbStreamStatus === 'running') {
                    pauseUsbStreaming()
                    logger.log('⏸️ Logs en pause')
                  } else if (usbStreamStatus === 'paused') {
                    startUsbStreaming(port)
                    logger.log('▶️ Logs reprennent')
                  }
                }}
                className={`px-3 py-1.5 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
                  usbStreamStatus === 'paused' 
                    ? 'bg-green-500 hover:bg-green-600' 
                    : 'bg-orange-500 hover:bg-orange-600'
                }`}
                title={usbStreamStatus === 'paused' ? 'Reprendre les logs' : 'Mettre en pause les logs'}
                disabled={!isConnected}
              >
                {usbStreamStatus === 'paused' ? '▶️' : '⏸️'}
              </button>
              <button
                onClick={() => {
                  const logs = [...usbStreamLogs, ...remoteLogs].join('\n')
                  navigator.clipboard.writeText(logs)
                    .then(() => {
                      logger.log('📋 Logs copiés dans le presse-papiers')
                    })
                    .catch(err => {
                      logger.error('❌ Erreur copie:', err)
                    })
                }}
                className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                title="Copier tous les logs"
              >
                📋 Copier
              </button>
              <button
                onClick={() => setShowClearLogsModal(true)}
                className="px-3 py-1.5 bg-gray-500 hover:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                title="Effacer la console"
              >
                🗑️ RAZ
              </button>
            </div>
          </div>
          <div 
            className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-900 p-4 shadow-inner overflow-y-auto" 
            style={{ minHeight: '500px', maxHeight: '600px' }}
          >
            {/* Indicateur de streaming distant pour admin */}
            {isStreamingRemote && (
              <div className="mb-3 flex items-center gap-2 text-xs">
                <span className="flex items-center gap-1 text-purple-400">
                  <span className="animate-pulse">📡</span>
                  Streaming distant en temps réel
                </span>
                <span className="text-gray-500">
                  ({remoteLogs.length} logs)
                </span>
              </div>
            )}
            
            {allLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
                <span className="text-4xl">📡</span>
                <p className="font-medium">
                  {isStreamingRemote ? 'Chargement du streaming distant...' : 'En attente de logs USB...'}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {isStreamingRemote 
                    ? 'Les logs apparaîtront ici dès qu\'ils seront disponibles'
                    : 'Connectez un dispositif USB et démarrez le streaming pour voir les logs'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-1 font-mono text-sm tracking-tight">
                {[...allLogs].reverse().map((log) => {
                  const isDashboard = log.source === 'dashboard'
                  const isRemote = log.isRemote
                  
                  // Essayer de formater le JSON si c'est un USB stream
                  const formattedJson = formatJsonLog(log.line)
                  const displayLine = formattedJson || log.line
                  
                  const category = analyzeLogCategory(displayLine)
                  const colorClass = getLogColorClass(category, isDashboard)
                  return (
                  <div key={log.id} className="whitespace-pre-wrap">
                    <span className="text-gray-500 pr-3">{new Date(log.timestamp).toLocaleTimeString('fr-FR')}</span>
                    {isRemote && <span className="text-purple-400 text-xs mr-2">📡</span>}
                    <span className={colorClass}>
                      {displayLine}
                    </span>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Modal de confirmation RAZ console */}
      {showClearLogsModal && (
        <div className="fixed inset-0 bg-black/50 dark:bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full border border-gray-200 dark:border-gray-700">
            <div className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <span className="text-3xl">⚠️</span>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-2">
                    Effacer la console ?
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Cette action supprimera tous les logs affichés dans la console USB.
                    Les logs ne seront pas supprimés de la base de données.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowClearLogsModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={() => {
                    if (typeof clearUsbStreamLogs === 'function') {
                      clearUsbStreamLogs()
                    }
                    setRemoteLogs([])
                    setShowClearLogsModal(false)
                    logger.log('🗑️ Console effacée')
                  }}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                >
                  🗑️ Effacer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


