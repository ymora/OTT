'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useSerialPort } from '@/components/SerialPortManager'
import { useAuth } from '@/contexts/AuthContext'
import logger from '@/lib/logger'
import { getUsbPortSharing } from '@/lib/usbPortSharing'

const UsbContext = createContext()

export function UsbProvider({ children }) {
  const { port, isConnected, isSupported, requestPort, connect, disconnect, startReading, write } = useSerialPort()
  const { fetchWithAuth, API_URL } = useAuth()
  
  // État USB global
  const [usbConnectedDevice, setUsbConnectedDevice] = useState(null)
  const [usbVirtualDevice, setUsbVirtualDevice] = useState(null)
  const [usbPortInfo, setUsbPortInfo] = useState(null)
  const [autoDetecting, setAutoDetecting] = useState(true)
  const [checkingUSB, setCheckingUSB] = useState(false)
  
  // Données reçues du dispositif USB en temps réel (uniquement depuis le dispositif, pas de la base de données)
  const [usbDeviceInfo, setUsbDeviceInfo] = useState(null) // { sim_iccid, device_serial, firmware_version, etc. }
  
  // État streaming USB
  const [usbStreamStatus, setUsbStreamStatus] = useState('idle') // 'idle', 'connecting', 'waiting', 'running', 'paused'
  const [usbStreamMeasurements, setUsbStreamMeasurements] = useState([])
  const [usbStreamLogs, setUsbStreamLogs] = useState([])
  const [usbStreamError, setUsbStreamError] = useState(null)
  const [usbStreamLastMeasurement, setUsbStreamLastMeasurement] = useState(null)
  const [usbStreamLastUpdate, setUsbStreamLastUpdate] = useState(null)
  
  const usbStreamStopRef = useRef(null)
  const usbStreamBufferRef = useRef('')
  const sendMeasurementToApiRef = useRef(null) // Callback pour envoyer les mesures à l'API
  const updateDeviceFirmwareRef = useRef(null) // Callback pour mettre à jour les informations du dispositif dans la base (firmware_version, last_battery, last_seen, status)
  const portSharingRef = useRef(null)
  const streamTimeoutRefs = useRef([]) // Références pour les timeouts de streaming
  
  // Batch des logs pour envoi au serveur (pour monitoring à distance)
  const logsToSendRef = useRef([])
  
  // Initialiser le système de partage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      portSharingRef.current = getUsbPortSharing()
      
      // Écouter les données partagées depuis un autre onglet
      const unsubscribeData = portSharingRef.current.on('data-received', (data) => {
        logger.debug('[UsbContext] Data received from master tab:', data)
        // Traiter les données comme si elles venaient du port local
        if (data.measurement) {
          setUsbStreamLastMeasurement(data.measurement)
          setUsbStreamLastUpdate(Date.now())
          setUsbStreamMeasurements(prev => {
            const next = [...prev, data.measurement]
            return next.slice(-120)
          })
        }
        if (data.deviceInfo) {
          setUsbDeviceInfo(data.deviceInfo)
        }
      })
      
      return () => {
        unsubscribeData()
      }
    }
  }, [])

  // Fonction pour ajouter un log USB
  // source: 'device' pour les logs venant du dispositif, 'dashboard' pour les logs du dashboard
  const appendUsbStreamLog = useCallback((line, source = 'device') => {
    if (!line) return
    
    const timestamp = Date.now()
    
    // Ajouter au state local pour affichage immédiat
    setUsbStreamLogs(prev => {
      const next = [...prev, { id: `${timestamp}-${Math.random()}`, line, timestamp, source }]
      return next.slice(-80)
    })
    
    // Ajouter au batch pour envoi au serveur (pour monitoring à distance)
    const currentDevice = usbConnectedDevice || usbVirtualDevice
    if (currentDevice) {
      logsToSendRef.current.push({
        log_line: line,
        log_source: source,
        timestamp: timestamp
      })
      
      // Limiter la taille du buffer (éviter la surcharge mémoire)
      if (logsToSendRef.current.length > 200) {
        logsToSendRef.current = logsToSendRef.current.slice(-200)
      }
    }
  }, [usbConnectedDevice, usbVirtualDevice])
  
  // Fonction pour effacer les logs
  const clearUsbStreamLogs = useCallback(() => {
    setUsbStreamLogs([])
    logger.log('🗑️ Console USB effacée')
    
    // Ajouter au batch pour envoi au serveur (si on a un dispositif connecté)
    const currentDevice = usbConnectedDevice || usbVirtualDevice
    if (currentDevice && sendMeasurementToApiRef.current) {
      logsToSendRef.current.push({
        log_line: line,
        log_source: source,
        timestamp: timestamp
      })
      
      // Limiter la taille du buffer (éviter la surcharge mémoire)
      if (logsToSendRef.current.length > 200) {
        logsToSendRef.current = logsToSendRef.current.slice(-200)
      }
    }
  }, [usbConnectedDevice, usbVirtualDevice])

  // Fonction pour préparer le port
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

  // Fonction pour envoyer les logs USB au serveur (batch)
  const sendLogsToServer = useCallback(async () => {
    // Vérifier qu'il y a des logs à envoyer
    if (logsToSendRef.current.length === 0) {
      return
    }
    
    const currentDevice = usbConnectedDevice || usbVirtualDevice
    if (!currentDevice) {
      // Même sans device, on peut envoyer les logs pour qu'ils soient visibles sur le web
      // Ne pas bloquer l'envoi des logs
    }
    
    // Identifier le dispositif (ou utiliser 'unknown' si pas disponible)
    const deviceIdentifier = currentDevice 
      ? (currentDevice.sim_iccid || currentDevice.device_serial || currentDevice.device_name)
      : 'unknown'
    
    if (!deviceIdentifier) {
      logger.debug('⚠️ Envoi logs sans identifiant de dispositif')
      // Continuer quand même, utiliser 'unknown' comme identifiant
    }
    
    // Copier les logs et vider le buffer
    const logsToSend = [...logsToSendRef.current]
    logsToSendRef.current = []
    
    try {
      // Utiliser l'API_URL pour envoyer directement au serveur distant
      const apiUrl = API_URL || 'https://ott-jbln.onrender.com'
      const response = await fetch(`${apiUrl}/api.php/usb-logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${typeof window !== 'undefined' ? localStorage.getItem('ott_token') || '' : ''}`
        },
        body: JSON.stringify({
          device_identifier: deviceIdentifier || 'unknown',
          device_name: currentDevice?.device_name || 'USB-Local',
          logs: logsToSend
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        logger.debug('⚠️ Erreur envoi logs USB:', response.status, errorData)
        // En cas d'erreur, remettre les logs dans le buffer pour réessayer plus tard
        logsToSendRef.current = [...logsToSend, ...logsToSendRef.current].slice(-200)
      } else {
        const result = await response.json()
        logger.debug(`✅ ${result.inserted_count || logsToSend.length} logs USB envoyés au serveur`)
      }
    } catch (err) {
      logger.debug('⚠️ Erreur envoi logs USB au serveur (non bloquant):', err.message || err)
      // En cas d'erreur, remettre les logs dans le buffer
      logsToSendRef.current = [...logsToSend, ...logsToSendRef.current].slice(-200)
    }
  }, [usbConnectedDevice, usbVirtualDevice, API_URL])
  
  // Timer pour envoyer les logs toutes les 5 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      sendLogsToServer()
    }, 5000) // Envoyer toutes les 5 secondes
    
    return () => {
      clearInterval(interval)
      // Envoyer les derniers logs avant de démonter
      if (logsToSendRef.current.length > 0) {
        sendLogsToServer()
      }
    }
  }, [sendLogsToServer])
  
  // Vérifier et envoyer les commandes UPDATE_CONFIG via USB
  useEffect(() => {
    if (!isConnected || !usbConnectedDevice || !write || !fetchWithAuth || !API_URL) return
    
    const checkAndSendCommands = async () => {
      try {
        // Récupérer l'ICCID ou serial pour identifier le device
        const device = usbConnectedDevice.sim_iccid || usbConnectedDevice.device_serial
        if (!device) return
        
        // Récupérer les commandes en attente via ICCID (comme le firmware)
        const response = await fetchWithAuth(
          `${API_URL}/api.php/devices/${device}/commands?status=pending&limit=5`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (!response.ok) return
        const data = await response.json()
        if (!data.success || !data.commands || data.commands.length === 0) return
        
        // Envoyer chaque commande UPDATE_CONFIG via USB
        for (const cmd of data.commands) {
          if (cmd.command === 'UPDATE_CONFIG' && cmd.payload) {
            const payload = typeof cmd.payload === 'string' 
              ? JSON.parse(cmd.payload) 
              : cmd.payload
            
            // Formater la commande pour le firmware (format: config {...})
            const commandLine = `config ${JSON.stringify(payload)}\n`
            await write(commandLine)
            
            logger.log(`📤 [USB] Commande UPDATE_CONFIG envoyée:`, payload)
          }
        }
      } catch (err) {
        logger.debug('Erreur vérification commandes USB:', err)
      }
    }
    
    // Vérifier toutes les 5 secondes
    const interval = setInterval(checkAndSendCommands, 5000)
    // Exécuter immédiatement au démarrage
    checkAndSendCommands()
    
    return () => clearInterval(interval)
  }, [isConnected, usbConnectedDevice, write, fetchWithAuth, API_URL])
  
  // Fonction pour envoyer une mesure à l'API avec retry et validation
  const sendMeasurementToApi = useCallback(async (measurement, device) => {
    if (!device || !sendMeasurementToApiRef.current) {
      const errorMsg = '⚠️ Pas de dispositif ou callback pour envoyer la mesure USB'
      logger.debug(errorMsg)
      appendUsbStreamLog(errorMsg)
      return
    }
    
    try {
      // Priorité : sim_iccid > device_serial > device_name (pour USB-xxx)
      let simIccid = device.sim_iccid
      
      // Si pas d'ICCID, utiliser device_serial
      if (!simIccid || simIccid === 'N/A' || simIccid.length < 10) {
        simIccid = device.device_serial
        logger.debug('📝 Utilisation device_serial comme ICCID:', simIccid)
      }
      
      // Si toujours pas d'identifiant valide, utiliser device_name (pour USB-xxx:yyy)
      if (!simIccid || simIccid === 'N/A') {
        // Extraire l'identifiant du nom USB-xxx:yyy
        const nameMatch = device.device_name?.match(/USB-([a-f0-9:]+)/i)
        if (nameMatch && nameMatch[1]) {
          simIccid = nameMatch[1]
          logger.debug('📝 Utilisation device_name comme ICCID:', simIccid)
        } else {
          simIccid = device.device_name
        }
      }
      
      if (!simIccid || simIccid === 'N/A') {
        const errorMsg = `❌ Impossible d'envoyer la mesure USB: pas d'identifiant disponible (nom: ${device.device_name || 'N/A'}, ICCID: ${device.sim_iccid || 'N/A'}, Serial: ${device.device_serial || 'N/A'})`
        logger.warn(errorMsg, {
          device_name: device.device_name,
          sim_iccid: device.sim_iccid,
          device_serial: device.device_serial
        })
        appendUsbStreamLog(errorMsg)
        return
      }

      // Priorité pour firmware_version :
      // 1. Version depuis le message usb_stream (measurement.raw.firmware_version) - la plus récente
      // 2. Version depuis device_info (device.firmware_version) - peut être obsolète
      // 3. null si aucune version disponible
      const firmwareVersion = measurement.raw?.firmware_version || device.firmware_version || null
      
      const measurementData = {
        sim_iccid: String(simIccid).trim(),
        flowrate: measurement.flowrate ?? 0,
        battery: measurement.battery ?? null,
        rssi: measurement.rssi ?? null,
        firmware_version: firmwareVersion,
        timestamp: new Date(measurement.timestamp).toISOString(),
        status: 'USB'
      }
      
      // Inclure les coordonnées GPS si disponibles (même pour USB)
      if (measurement.latitude != null && measurement.longitude != null) {
        measurementData.latitude = measurement.latitude
        measurementData.longitude = measurement.longitude
      }

      logger.debug('📤 Envoi mesure USB à l\'API:', measurementData)
      
      // Vérifier que le callback est bien configuré
      if (!sendMeasurementToApiRef.current) {
        const errorMsg = '⚠️ Callback sendMeasurement non configuré - mesure non envoyée'
        logger.warn(errorMsg)
        appendUsbStreamLog(errorMsg)
        return
      }
      
      // Log dans la console de logs de l'interface
      const logMessage = `📤 Préparation envoi mesure à l'API distante: ICCID=${measurementData.sim_iccid || 'N/A'} | Débit=${measurementData.flowrate ?? 0} L/min | Batterie=${measurementData.battery ?? 'N/A'}% | RSSI=${measurementData.rssi ?? 'N/A'}`
      appendUsbStreamLog(logMessage)
      
      // Utiliser le système robuste d'envoi avec retry
      const { sendMeasurementWithRetry } = await import('@/lib/measurementSender')
      const result = await sendMeasurementWithRetry(measurementData, sendMeasurementToApiRef.current)
      
      if (result.success) {
        logger.debug('✅ Mesure USB envoyée avec succès')
        appendUsbStreamLog('✅ Mesure envoyée et enregistrée avec succès dans la base distante')
      } else if (result.queued) {
        logger.info('📦 Mesure USB mise en queue pour retry ultérieur')
        appendUsbStreamLog(`📦 Mesure mise en queue pour retry ultérieur (erreur: ${result.error?.message || result.error || 'Erreur inconnue'})`)
      } else {
        logger.warn('⚠️ Échec envoi mesure USB:', result.error)
        appendUsbStreamLog(`⚠️ ÉCHEC envoi mesure: ${result.error?.message || result.error || 'Erreur inconnue'}`)
      }
    } catch (err) {
      const errorMsg = `❌ Erreur envoi mesure USB à l'API: ${err.message || err}`
      logger.error(errorMsg, err, { device })
      appendUsbStreamLog(errorMsg)
    }
  }, [appendUsbStreamLog])

  // Traitement des lignes de streaming USB
  const processUsbStreamLine = useCallback((line) => {
    if (!line) {
      logger.debug('processUsbStreamLine: ligne vide')
      return
    }
    const trimmed = line.trim()
    if (!trimmed) {
      logger.debug('processUsbStreamLine: ligne vide après trim')
      return
    }

    logger.debug('processUsbStreamLine:', trimmed.substring(0, Math.min(100, trimmed.length)))
    
    // Toujours ajouter les logs - TOUJOURS, même pour les lignes brutes
    appendUsbStreamLog(trimmed)
    logger.debug('✅ Log ajouté via appendUsbStreamLog:', trimmed.substring(0, 50))

    // Parser les messages JSON du firmware
    // Le format unifié envoie un JSON complet avec TOUT : identifiants + mesures + configuration
    if (trimmed.startsWith('{')) {
      try {
        const payload = JSON.parse(trimmed)
        
        // Log les premiers messages JSON (debug création device)
        if (!payload.seq || payload.seq <= 5) {
          const logData = {
            seq: payload.seq || 0,
            iccid: payload.sim_iccid?.slice(-10),
            serial: payload.device_serial,
            flow: payload.flow_lpm,
            battery: payload.battery_percent
          }
          logger.log('📥 JSON:', logData)
          appendUsbStreamLog(`📥 JSON reçu: SEQ=${logData.seq} | ICCID=...${logData.iccid} | Serial=${logData.serial || 'N/A'} | Flow=${logData.flow || 'N/A'} | Battery=${logData.battery || 'N/A'}%`)
        }
        
        // Log pour vérifier la réception des données usb_stream
        const isUsbStreamForLog = payload.mode === 'usb_stream' || 
                                  payload.type === 'usb_stream' || 
                                  (payload.status === 'USB_STREAM' && payload.flow_lpm != null) ||
                                  (payload.flow_lpm != null && payload.battery_percent != null && !payload.type)
        if (isUsbStreamForLog) {
          const streamData = {
            seq: payload.seq,
            flow_lpm: payload.flow_lpm,
            flowrate: payload.flowrate,
            flow: payload.flow,
            battery_percent: payload.battery_percent,
            battery: payload.battery,
            rssi: payload.rssi,
            latitude: payload.latitude,
            longitude: payload.longitude,
            hasGPS: !!(payload.latitude && payload.longitude),
            mode: payload.mode,
            type: payload.type,
            status: payload.status
          }
          logger.log('📊 Données usb_stream reçues:', streamData)
          // Formater pour la console de logs
          const flowValue = streamData.flow_lpm ?? streamData.flowrate ?? streamData.flow ?? 'N/A'
          const batteryValue = streamData.battery_percent ?? streamData.battery ?? 'N/A'
          const rssiValue = streamData.rssi ?? 'N/A'
          const gpsInfo = streamData.hasGPS ? ` | GPS: ${streamData.latitude?.toFixed(6)}, ${streamData.longitude?.toFixed(6)}` : ''
          appendUsbStreamLog(`📊 Mesure reçue: SEQ=${streamData.seq || 'N/A'} | Débit=${flowValue} L/min | Batterie=${batteryValue}% | RSSI=${rssiValue}${gpsInfo}`)
        }
        
        // Format unifié : tous les messages usb_stream contiennent identifiants + mesures + configuration
        // Détecter le format unifié : si mode/type = usb_stream, c'est le format unifié
        const isUnifiedFormat = payload.mode === 'usb_stream' || payload.type === 'usb_stream' || payload.status === 'USB_STREAM'
        
        // Message device_info : format ancien (compatibilité - seulement si ce n'est PAS le format unifié)
        if (payload.type === 'device_info' && !isUnifiedFormat) {
          if (process.env.NODE_ENV === 'development') {
            logger.debug('📱 Device info reçu')
          }
          appendUsbStreamLog(`📱 Device info reçu: ICCID=${payload.iccid?.slice(-10) || 'N/A'} | Serial=${payload.serial || 'N/A'} | Nom=${payload.device_name || 'N/A'} | Firmware=${payload.firmware_version || 'N/A'}`)
          
          const now = new Date().toISOString()
          
          // Stocker TOUTES les données reçues du dispositif (uniquement depuis le dispositif USB)
          const deviceInfoFromUsb = {
            sim_iccid: payload.iccid || null,
            device_serial: payload.serial || null,
            firmware_version: payload.firmware_version || null,
            device_name: payload.device_name || null,
            last_seen: now
          }
          
          // Mettre à jour l'état avec TOUTES les données reçues du dispositif
          setUsbDeviceInfo(prev => ({
            ...prev,
            // Utiliser les nouvelles valeurs si disponibles, sinon conserver les précédentes
            sim_iccid: deviceInfoFromUsb.sim_iccid || prev?.sim_iccid || null,
            device_serial: deviceInfoFromUsb.device_serial || prev?.device_serial || null,
            firmware_version: deviceInfoFromUsb.firmware_version || prev?.firmware_version || null,
            device_name: deviceInfoFromUsb.device_name || prev?.device_name || null,
            // Conserver les autres données (batterie, GPS, RSSI) si elles existent déjà
            last_battery: prev?.last_battery || null,
            latitude: prev?.latitude || null,
            longitude: prev?.longitude || null,
            rssi: prev?.rssi || null,
            last_seen: now
          }))
          
          // Créer ou mettre à jour un dispositif virtuel avec ces infos (pour compatibilité)
          const deviceInfo = {
            id: `usb_info_${Date.now()}`,
            device_name: payload.device_name || `USB-${payload.iccid?.slice(-4) || payload.serial?.slice(-4) || 'XXXX'}`,
            sim_iccid: payload.iccid || null,
            device_serial: payload.serial || null,
            firmware_version: payload.firmware_version || null,
            status: 'usb_connected',
            last_seen: now,
            isVirtual: true,
            fromUsbInfo: true // Flag pour indiquer que c'est depuis device_info
          }
          
          // Si on n'a pas encore de dispositif USB connecté, utiliser ces infos
          if (!usbConnectedDevice && !usbVirtualDevice) {
            setUsbVirtualDevice(deviceInfo)
              if (process.env.NODE_ENV === 'development') {
                logger.debug('✅ Dispositif USB créé:', deviceInfo.device_name)
              }
          } else if (usbConnectedDevice) {
            setUsbConnectedDevice(prev => ({
              ...prev,
              ...deviceInfo,
              firmware_version: deviceInfo.firmware_version || prev.firmware_version,
              last_seen: now
            }))
          } else if (usbVirtualDevice) {
            setUsbVirtualDevice(prev => ({
              ...prev,
              ...deviceInfo,
              firmware_version: deviceInfo.firmware_version || prev.firmware_version,
              last_seen: now
            }))
          }
          
          // Mettre à jour automatiquement les informations du dispositif dans la base de données
          // À CHAQUE réception de device_info, on vérifie et met à jour la base de données
          if (updateDeviceFirmwareRef.current) {
            // Essayer ICCID d'abord, puis serial, puis device_name
            const identifier = payload.iccid || payload.serial || payload.device_name
            if (identifier) {
              const firmwareVersion = payload.firmware_version || ''
              
              // Mettre à jour la base de données avec les informations disponibles
              updateDeviceFirmwareRef.current(identifier, firmwareVersion, {
                last_seen: now,
                status: 'usb_connected'
                // Pas de last_battery dans device_info, seulement dans les mesures
              })
              
              logger.debug('🔄 Mise à jour base de données (device_info):', {
                identifier,
                firmwareVersion: firmwareVersion || '(non disponible)',
                last_seen: now
              })
            } else {
              logger.debug('⚠️ Aucun identifiant disponible dans device_info pour mise à jour base de données')
            }
          } else {
            logger.debug('⚠️ Callback updateDeviceFirmwareRef non disponible pour device_info')
          }
          
          return
        }
        
        // Message device_config : format ancien (compatibilité)
        if (payload.type === 'device_config' && !isUnifiedFormat) {
          if (process.env.NODE_ENV === 'development') {
            logger.debug('⚙️ Config reçue')
          }
          
          // Stocker la configuration reçue du dispositif
          const deviceConfigFromUsb = {
            sleep_minutes: payload.sleep_minutes ?? null,
            measurement_duration_ms: payload.measurement_duration_ms ?? null,
            calibration_coefficients: payload.calibration_coefficients 
              ? (Array.isArray(payload.calibration_coefficients) 
                  ? payload.calibration_coefficients 
                  : [payload.calibration_coefficients[0] || 0, payload.calibration_coefficients[1] || 1, payload.calibration_coefficients[2] || 0])
              : [0, 1, 0]
          }
          
          // Mettre à jour l'état avec la configuration reçue
          setUsbDeviceInfo(prev => ({
            ...prev,
            config: deviceConfigFromUsb
          }))
          
          logger.log('✅ Configuration USB stockée:', {
            sleep_minutes: deviceConfigFromUsb.sleep_minutes,
            measurement_duration_ms: deviceConfigFromUsb.measurement_duration_ms,
            calibration: deviceConfigFromUsb.calibration_coefficients
          })
          appendUsbStreamLog(`⚙️ Configuration stockée: Sleep=${deviceConfigFromUsb.sleep_minutes ?? 'N/A'} min | Durée=${deviceConfigFromUsb.measurement_duration_ms ?? 'N/A'} ms | Calibration=[${deviceConfigFromUsb.calibration_coefficients?.join(', ') || 'N/A'}]`)
          
          // Émettre un événement personnalisé pour notifier DeviceConfigSection
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('usb-device-config-received', {
              detail: deviceConfigFromUsb
            }))
          }
          return
        }
        
        // Format unifié : traiter identifiants + mesures + configuration en une seule fois
        if (isUnifiedFormat) {
          const now = new Date().toISOString()
          
          // Log pour les 3 premiers messages
          if (!payload.seq || payload.seq <= 3) {
            logger.log('✅ Format unifié détecté:', {
              seq: payload.seq,
              mode: payload.mode,
              type: payload.type,
              has_sim_iccid: !!payload.sim_iccid,
              has_device_name: !!payload.device_name,
              has_firmware_version: !!payload.firmware_version,
              has_flow_lpm: payload.flow_lpm != null,
              has_battery: payload.battery_percent != null
            })
          }
          
          // 1. Extraire et stocker les identifiants (toujours présents dans le format unifié)
          {
            logger.log('🔍🔍🔍 [USB] PAYLOAD REÇU:', {
              type: payload.type,
              mode: payload.mode,
              sim_iccid: payload.sim_iccid,
              device_serial: payload.device_serial,
              device_name: payload.device_name,
              firmware_version: payload.firmware_version,
              allKeys: Object.keys(payload)
            })
            // Log dans la console de logs de l'interface
            appendUsbStreamLog(`🔍 Payload reçu: Type=${payload.type || 'N/A'} | Mode=${payload.mode || 'N/A'} | ICCID=${payload.sim_iccid?.slice(-10) || 'N/A'} | Serial=${payload.device_serial || 'N/A'} | Nom=${payload.device_name || 'N/A'} | Firmware=${payload.firmware_version || 'N/A'}`)
            
            const deviceInfoFromUsb = {
              sim_iccid: payload.sim_iccid || null,
              device_serial: payload.device_serial || null,
              firmware_version: payload.firmware_version || null,
              device_name: payload.device_name || null,
              last_seen: now
            }
            
            setUsbDeviceInfo(prev => {
              const next = {
                ...prev,
                sim_iccid: deviceInfoFromUsb.sim_iccid || prev?.sim_iccid || null,
                device_serial: deviceInfoFromUsb.device_serial || prev?.device_serial || null,
                firmware_version: deviceInfoFromUsb.firmware_version || prev?.firmware_version || null,
                device_name: deviceInfoFromUsb.device_name || prev?.device_name || null,
                last_seen: now
              }
              
              // Log identifiants reçus (IMPORTANT pour debug)
              logger.log('📝 [USB] Device Info:', {
                iccid: next.sim_iccid?.slice(-10),
                serial: next.device_serial,
                name: next.device_name
              })
              
              // Log uniquement si les identifiants sont présents et différents
              if ((next.sim_iccid || next.device_serial) && 
                  (next.sim_iccid !== prev?.sim_iccid || next.device_serial !== prev?.device_serial)) {
                logger.log('📝 [USB] ✅ Mise à jour usbDeviceInfo avec NOUVEAUX identifiants:', {
                  sim_iccid: next.sim_iccid,
                  device_serial: next.device_serial,
                  device_name: next.device_name,
                  firmware_version: next.firmware_version
                })
              }
              
              return next
            })
            
            // Créer ou mettre à jour un dispositif virtuel
            const deviceInfo = {
              id: `usb_info_${Date.now()}`,
              device_name: payload.device_name || `USB-${payload.sim_iccid?.slice(-4) || payload.device_serial?.slice(-4) || 'XXXX'}`,
              sim_iccid: payload.sim_iccid || null,
              device_serial: payload.device_serial || null,
              firmware_version: payload.firmware_version || null,
              status: 'usb_connected',
              last_seen: now,
              isVirtual: true,
              fromUsbInfo: true
            }
            
            if (!usbConnectedDevice && !usbVirtualDevice) {
              setUsbVirtualDevice(deviceInfo)
            } else if (usbConnectedDevice) {
              setUsbConnectedDevice(prev => ({
                ...prev,
                ...deviceInfo,
                firmware_version: deviceInfo.firmware_version || prev.firmware_version,
                last_seen: now
              }))
            } else if (usbVirtualDevice) {
              setUsbVirtualDevice(prev => ({
                ...prev,
                ...deviceInfo,
                firmware_version: deviceInfo.firmware_version || prev.firmware_version,
                last_seen: now
              }))
            }
            
            // Mettre à jour la base de données
            if (updateDeviceFirmwareRef.current) {
              const identifier = payload.sim_iccid || payload.device_serial || payload.device_name
              if (identifier) {
                const firmwareVersion = payload.firmware_version || ''
                updateDeviceFirmwareRef.current(identifier, firmwareVersion, {
                  last_seen: now,
                  status: 'usb_connected'
                })
              }
            }
          }
          
          // 2. Extraire et stocker la configuration
          if (payload.sleep_minutes != null || payload.measurement_duration_ms != null || payload.calibration_coefficients) {
            const deviceConfigFromUsb = {
              sleep_minutes: payload.sleep_minutes ?? null,
              measurement_duration_ms: payload.measurement_duration_ms ?? null,
              calibration_coefficients: payload.calibration_coefficients 
                ? (Array.isArray(payload.calibration_coefficients) 
                    ? payload.calibration_coefficients 
                    : [payload.calibration_coefficients[0] || 0, payload.calibration_coefficients[1] || 1, payload.calibration_coefficients[2] || 0])
                : [0, 1, 0]
            }
            
            logger.log('✅ Configuration extraite du format unifié:', deviceConfigFromUsb)
            appendUsbStreamLog(`⚙️ Configuration reçue: Sleep=${deviceConfigFromUsb.sleep_minutes ?? 'N/A'} min | Durée=${deviceConfigFromUsb.measurement_duration_ms ?? 'N/A'} ms | Calibration=[${deviceConfigFromUsb.calibration_coefficients?.join(', ') || 'N/A'}]`)
            
            setUsbDeviceInfo(prev => ({
              ...prev,
              config: deviceConfigFromUsb
            }))
            
            // Émettre l'événement pour DeviceConfigSection
            if (typeof window !== 'undefined') {
              logger.log('📢 Émission événement usb-device-config-received')
              window.dispatchEvent(new CustomEvent('usb-device-config-received', {
                detail: deviceConfigFromUsb
              }))
            }
          } else {
            logger.debug('⚠️ Format unifié sans configuration (sleep_minutes, measurement_duration_ms, calibration_coefficients tous null/undefined)')
          }
          
          // 3. Extraire et stocker les mesures (toujours présentes dans le format unifié, même si certaines valeurs sont null)
          // Le format unifié envoie toujours flow_lpm, battery_percent, rssi (peuvent être null/undefined)
          {
          const measurement = {
            id: `usb-${payload.seq ?? Date.now()}`,
            seq: payload.seq ?? null,
            timestamp: Date.now(),
            flowrate: payload.flow_lpm ?? payload.flowrate ?? payload.flow ?? null,
            battery: payload.battery_percent ?? payload.battery ?? null,
            rssi: payload.rssi ?? null,
            latitude: payload.latitude ?? null,
            longitude: payload.longitude ?? null,
            interval: payload.interval_ms ?? payload.interval ?? null,
            raw: {
              ...payload,
              firmware_version: payload.firmware_version || null
            },
          }
          
          // Log toutes les mesures reçues dans la console de logs
          const measureLogMsg = `📊 Mesure reçue: SEQ=${measurement.seq ?? 'N/A'} | Débit=${measurement.flowrate ?? 'N/A'} L/min | Batterie=${measurement.battery ?? 'N/A'}% | RSSI=${measurement.rssi ?? 'N/A'}${measurement.latitude && measurement.longitude ? ` | GPS: ${measurement.latitude.toFixed(6)}, ${measurement.longitude.toFixed(6)}` : ''}`
          appendUsbStreamLog(measureLogMsg)
          
          // Log pour debug (toutes les mesures en développement)
          if (process.env.NODE_ENV === 'development') {
            logger.debug('📊 Mesure USB reçue:', {
              seq: payload.seq,
              flow_lpm: payload.flow_lpm,
              flowrate: payload.flowrate,
              flow: payload.flow,
              battery_percent: payload.battery_percent,
              battery: payload.battery,
              rssi: payload.rssi,
              latitude: payload.latitude,
              longitude: payload.longitude,
              parsed_flowrate: measurement.flowrate,
              parsed_battery: measurement.battery,
              parsed_latitude: measurement.latitude,
              parsed_longitude: measurement.longitude
            })
          }
          
          // Log également en production pour les premières mesures (pour debug)
          if (!payload.seq || payload.seq <= 3) {
            logger.log('📊 Mesure USB #' + (payload.seq || '?') + ':', {
              flowrate: measurement.flowrate,
              battery: measurement.battery,
              rssi: measurement.rssi,
              gps: measurement.latitude && measurement.longitude ? `${measurement.latitude.toFixed(4)}, ${measurement.longitude.toFixed(4)}` : 'N/A'
            })
          }

            setUsbStreamMeasurements(prev => {
              const next = [...prev, measurement]
              return next.slice(-120)
            })
            setUsbStreamLastMeasurement(measurement)
            setUsbStreamLastUpdate(Date.now())
            setUsbStreamError(null)
            setUsbStreamStatus('running')
            
            // Partager les données avec les autres onglets si on est master
            if (portSharingRef.current && portSharingRef.current.isMaster) {
              portSharingRef.current.notifyDataReceived({
                measurement,
                deviceInfo: usbDeviceInfo,
                timestamp: Date.now()
              })
            }
            
            // Mettre à jour usbDeviceInfo avec les mesures
            setUsbDeviceInfo(prev => ({
              ...prev,
              flowrate: measurement.flowrate !== null && measurement.flowrate !== undefined 
                ? measurement.flowrate 
                : prev?.flowrate || null,
              last_battery: measurement.battery !== null && measurement.battery !== undefined 
                ? measurement.battery 
                : prev?.last_battery || null,
              latitude: measurement.latitude !== null && measurement.latitude !== undefined 
                ? measurement.latitude 
                : prev?.latitude || null,
              longitude: measurement.longitude !== null && measurement.longitude !== undefined 
                ? measurement.longitude 
                : prev?.longitude || null,
              rssi: measurement.rssi !== null && measurement.rssi !== undefined && measurement.rssi !== -999
                ? measurement.rssi 
                : prev?.rssi || null,
              last_seen: now
            }))
            
            // Envoyer la mesure à l'API si un dispositif USB est connecté
            const currentDevice = usbConnectedDevice || usbVirtualDevice
            logger.log('🔍 [USB-CONTEXT] Check envoi mesure:', {
              hasCurrentDevice: !!currentDevice,
              currentDevice: currentDevice ? currentDevice.device_name : 'AUCUN',
              usbConnectedDevice: usbConnectedDevice ? usbConnectedDevice.device_name : 'null',
              usbVirtualDevice: usbVirtualDevice ? usbVirtualDevice.device_name : 'null',
              hasCallback: !!sendMeasurementToApiRef.current
            })
            if (currentDevice) {
              logger.log('📤 [USB-CONTEXT] Appel sendMeasurementToApi...')
              sendMeasurementToApi(measurement, currentDevice)
              
              // Mettre à jour la base de données avec les dernières valeurs (batterie, débit, RSSI)
              if (updateDeviceFirmwareRef.current) {
                const identifier = currentDevice.sim_iccid || currentDevice.device_serial || currentDevice.device_name
                if (identifier) {
                  updateDeviceFirmwareRef.current(identifier, null, {
                    last_seen: now,
                    status: 'usb_connected',
                    last_battery: measurement.battery !== null && measurement.battery !== undefined ? measurement.battery : undefined,
                    last_flowrate: measurement.flowrate !== null && measurement.flowrate !== undefined ? measurement.flowrate : undefined,
                    last_rssi: measurement.rssi !== null && measurement.rssi !== undefined && measurement.rssi !== -999 ? measurement.rssi : undefined
                  })
                }
              }
            }
          }
          
          return // Format unifié traité, ne pas continuer avec les anciens formats
        }
        
        // Message usb_stream : format ancien (compatibilité - sans identifiants/config)
        const isUsbStream = payload.mode === 'usb_stream' || 
                           payload.type === 'usb_stream' || 
                           (payload.status === 'USB_STREAM' && payload.flow_lpm != null) ||
                           (payload.flow_lpm != null && payload.battery_percent != null && !payload.type)
                           
        if (isUsbStream) {
          const measurement = {
            id: `usb-${payload.seq ?? Date.now()}`,
            seq: payload.seq ?? null,
            timestamp: Date.now(),
            flowrate: payload.flow_lpm ?? payload.flowrate ?? payload.flow ?? null,
            battery: payload.battery_percent ?? payload.battery ?? null,
            rssi: payload.rssi ?? null,
            latitude: payload.latitude ?? null,
            longitude: payload.longitude ?? null,
            interval: payload.interval_ms ?? payload.interval ?? null,
            raw: {
              ...payload,
              firmware_version: payload.firmware_version || null
            },
          }
          
          // Log pour debug (toutes les mesures en développement)
          if (process.env.NODE_ENV === 'development') {
            logger.debug('📊 Mesure USB reçue:', {
              seq: payload.seq,
              flow_lpm: payload.flow_lpm,
              flowrate: payload.flowrate,
              flow: payload.flow,
              battery_percent: payload.battery_percent,
              battery: payload.battery,
              rssi: payload.rssi,
              latitude: payload.latitude,
              longitude: payload.longitude,
              parsed_flowrate: measurement.flowrate,
              parsed_battery: measurement.battery,
              parsed_latitude: measurement.latitude,
              parsed_longitude: measurement.longitude
            })
          }
          
          // Log également en production pour les premières mesures (pour debug)
          if (!payload.seq || payload.seq <= 3) {
            logger.log('📊 Mesure USB #' + (payload.seq || '?') + ':', {
              flowrate: measurement.flowrate,
              battery: measurement.battery,
              rssi: measurement.rssi,
              gps: measurement.latitude && measurement.longitude ? `${measurement.latitude.toFixed(4)}, ${measurement.longitude.toFixed(4)}` : 'N/A'
            })
          }

          setUsbStreamMeasurements(prev => {
            const next = [...prev, measurement]
            return next.slice(-120)
          })
          setUsbStreamLastMeasurement(measurement)
          setUsbStreamLastUpdate(Date.now())
          setUsbStreamError(null)
          setUsbStreamStatus('running')
          
          // Partager les données avec les autres onglets si on est master
          if (portSharingRef.current && portSharingRef.current.isMaster) {
            portSharingRef.current.notifyDataReceived({
              measurement,
              deviceInfo: usbDeviceInfo,
              timestamp: Date.now()
            })
          }
          
          // Mettre à jour TOUTES les données reçues du dispositif USB (uniquement depuis le dispositif)
          // À chaque réception, on met à jour toutes les informations disponibles
          const now = new Date().toISOString()
          setUsbDeviceInfo(prev => ({
            ...prev,
            // Conserver les identifiants existants (ICCID, Serial) car ils ne changent pas
            sim_iccid: prev?.sim_iccid || null,
            device_serial: prev?.device_serial || null,
            // Mettre à jour la version firmware si disponible dans le payload
            firmware_version: payload.firmware_version || prev?.firmware_version || null,
            // Mettre à jour le flowrate si disponible
            flowrate: measurement.flowrate !== null && measurement.flowrate !== undefined 
              ? measurement.flowrate 
              : prev?.flowrate || null,
            // Mettre à jour la batterie si disponible
            last_battery: measurement.battery !== null && measurement.battery !== undefined 
              ? measurement.battery 
              : prev?.last_battery || null,
            // Mettre à jour la position GPS si disponible
            latitude: measurement.latitude !== null && measurement.latitude !== undefined 
              ? measurement.latitude 
              : prev?.latitude || null,
            longitude: measurement.longitude !== null && measurement.longitude !== undefined 
              ? measurement.longitude 
              : prev?.longitude || null,
            // Mettre à jour le RSSI si disponible
            rssi: measurement.rssi !== null && measurement.rssi !== undefined && measurement.rssi !== -999
              ? measurement.rssi 
              : prev?.rssi || null,
            // Toujours mettre à jour last_seen
            last_seen: now
          }))
          
          // Envoyer la mesure à l'API si un dispositif USB est connecté
          const currentDevice = usbConnectedDevice || usbVirtualDevice
          logger.log('🔍 [USB-CONTEXT-OLD] Check envoi mesure:', {
            hasCurrentDevice: !!currentDevice,
            currentDevice: currentDevice ? currentDevice.device_name : 'AUCUN',
            hasCallback: !!sendMeasurementToApiRef.current
          })
          if (currentDevice) {
            logger.log('📤 [USB-CONTEXT-OLD] Appel sendMeasurementToApi...')
            sendMeasurementToApi(measurement, currentDevice)
            
            // Mettre à jour les informations du dispositif dans la base de données
            // À CHAQUE réception, on vérifie et met à jour la base de données si nécessaire
            if (updateDeviceFirmwareRef.current) {
              // Utiliser les données du dispositif USB en priorité (données en temps réel)
              const identifier = usbDeviceInfo?.sim_iccid || usbDeviceInfo?.device_serial || 
                                 currentDevice.sim_iccid || currentDevice.device_serial || currentDevice.device_name
              
              if (identifier) {
                // Récupérer toutes les informations disponibles depuis le dispositif USB
                const firmwareVersion = payload.firmware_version || usbDeviceInfo?.firmware_version || currentDevice.firmware_version
                
                // Préparer les données à mettre à jour dans la base de données
                const updateData = {
                  last_seen: now,
                  status: 'usb_connected'
                }
                
                // Ajouter la batterie si disponible
                if (measurement.battery !== null && measurement.battery !== undefined) {
                  updateData.last_battery = measurement.battery
                }
                
                // Ajouter le débit si disponible
                if (measurement.flowrate !== null && measurement.flowrate !== undefined) {
                  updateData.last_flowrate = measurement.flowrate
                }
                
                // Ajouter le RSSI si disponible
                if (measurement.rssi !== null && measurement.rssi !== undefined && measurement.rssi !== -999) {
                  updateData.last_rssi = measurement.rssi
                }
                
                // Mettre à jour la base de données avec toutes les informations disponibles
                // Même si firmwareVersion n'est pas disponible, on met à jour last_seen, status, last_battery, last_flowrate, last_rssi
                updateDeviceFirmwareRef.current(identifier, firmwareVersion || '', updateData)
                
                logger.debug('🔄 Mise à jour base de données demandée:', {
                  identifier,
                  firmwareVersion: firmwareVersion || '(non disponible)',
                  battery: measurement.battery !== null && measurement.battery !== undefined ? measurement.battery : '(non disponible)',
                  last_seen: now
                })
              } else {
                logger.debug('⚠️ Aucun identifiant disponible pour mise à jour base de données')
              }
            } else {
              logger.debug('⚠️ Callback updateDeviceFirmwareRef non disponible')
            }
          } else {
            logger.debug('⚠️ Aucun dispositif USB connecté pour mise à jour')
          }
          
          return
        }
      } catch (err) {
        logger.debug('JSON invalide:', trimmed, err)
        return
      }
    }
  }, [appendUsbStreamLog, sendMeasurementToApi, usbConnectedDevice, usbVirtualDevice, usbDeviceInfo])

  // Gestion des chunks de streaming
  const handleUsbStreamChunk = useCallback((chunk) => {
    if (!chunk) {
      logger.debug('⚠️ handleUsbStreamChunk: chunk vide ou null')
      return
    }
    
    logger.debug('📥 [USB] Chunk reçu, longueur:', chunk.length)
    
    // Accumuler les chunks dans le buffer jusqu'à avoir une ligne complète (terminée par \n)
    usbStreamBufferRef.current += chunk
    
    // Extraire toutes les lignes complètes (terminées par \n ou \r\n)
    const parts = usbStreamBufferRef.current.split(/\r?\n/)
    // Garder la dernière partie (incomplète) dans le buffer pour le prochain chunk
    usbStreamBufferRef.current = parts.pop() ?? ''
    
    // Vérifier si le buffer contient un JSON complet sans \n (cas spécial)
    if (parts.length === 0 && usbStreamBufferRef.current.length > 0) {
      const trimmed = usbStreamBufferRef.current.trim()
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        // JSON complet détecté sans \n - le traiter immédiatement
        try {
          JSON.parse(trimmed) // Vérifier que c'est valide
          processUsbStreamLine(trimmed)
          usbStreamBufferRef.current = ''
          return
        } catch (e) {
          // JSON incomplet, attendre la suite
        }
      }
    }
    
    // Traiter toutes les lignes extraites
    let jsonCount = 0
    parts.forEach((line) => {
      if (line || line === '') {
        const trimmed = line.trim()
        
        // Log uniquement les JSON (pas les logs du firmware)
        if (trimmed.startsWith('{')) {
          jsonCount++
          try {
            const testPayload = JSON.parse(trimmed)
            // Log tous les JSON (mais pas trop verbeux)
            logger.log(`📥 JSON #${jsonCount} - type: ${testPayload.type || testPayload.mode || 'unknown'}, seq: ${testPayload.seq || 'N/A'}`)
            
            // Log détaillé pour la configuration
            if (testPayload.sleep_minutes != null || testPayload.measurement_duration_ms != null || testPayload.calibration_coefficients) {
              logger.log(`✅ Configuration détectée dans JSON:`, {
                sleep_minutes: testPayload.sleep_minutes,
                measurement_duration_ms: testPayload.measurement_duration_ms,
                calibration: testPayload.calibration_coefficients
              })
            }
          } catch (e) {
            logger.warn(`❌ JSON invalide:`, e.message, `| Ligne: ${trimmed.substring(0, 100)}`)
          }
        }
        
        processUsbStreamLine(line)
      }
    })
    
    // Log un résumé si plusieurs lignes traitées (mais pas de JSON)
    if (parts.length > 0 && jsonCount === 0) {
      logger.debug(`📥 ${parts.length} ligne(s) de log du firmware traitée(s)`)
    }
    
    if (usbStreamStatus === 'waiting') {
      logger.log('✅ Premier chunk reçu, passage à running')
      setUsbStreamStatus('running')
    }
  }, [processUsbStreamLine, usbStreamStatus])

  // Démarrer ou reprendre le streaming USB
  const startUsbStreaming = useCallback(async (explicitPort = null) => {
    try {
      setUsbStreamError(null)
      
      // Si on reprend depuis une pause, ne pas réinitialiser les logs
      const isResuming = usbStreamStatus === 'paused'
      
      if (isResuming) {
        logger.log('▶️ [USB] Reprise du streaming USB depuis la pause...')
        setUsbStreamStatus('connecting')
      } else {
        logger.debug('[USB] Starting stream')
        setUsbStreamStatus('connecting')
      }
      
      // Utiliser le port explicite si fourni, sinon utiliser le port du contexte
      const portToUse = explicitPort || port
      
      // Vérifier si le port est disponible et ouvert
      const portIsOpen = portToUse && portToUse.readable && portToUse.writable
      const portIsConnected = portToUse && isConnected
      
      if (portIsOpen || portIsConnected) {
        logger.debug('[USB] Port ready')
        // Si le port est ouvert mais pas dans le contexte, mettre à jour le contexte
        if (portToUse && portToUse !== port) {
          logger.log('🔄 [USB] Mise à jour du port dans le contexte...')
          // Le port sera mis à jour automatiquement par SerialPortManager
        }
      } else if (portToUse && !portIsOpen && !portIsConnected) {
        // Port existe mais pas ouvert, essayer de reconnecter
        logger.log('🔄 [USB] Port existe mais non ouvert, reconnexion...')
        const reconnected = await connect(portToUse, 115200)
        if (!reconnected) {
          throw new Error('Impossible de reconnecter au port')
        }
        logger.log('✅ [USB] Port reconnecté')
      } else {
        // Aucun port disponible - ne pas appeler ensurePortReady ici
        // car cela ouvrirait un modal. Le composant doit gérer la connexion avant
        logger.error('❌ [USB] Aucun port USB connecté')
        throw new Error('Aucun port USB connecté. Veuillez sélectionner et connecter un port d\'abord.')
      }

      // Arrêter l'ancien streaming s'il existe (si on n'est pas en pause)
      if (usbStreamStopRef.current && !isResuming) {
        logger.debug('[USB] Stop ancien stream')
        try {
          usbStreamStopRef.current()
        } catch (stopErr) {
          logger.warn('⚠️ [USB] Erreur lors de l\'arrêt de l\'ancien streaming:', stopErr)
        }
        usbStreamStopRef.current = null
        // Attendre un peu pour que l'ancien streaming se termine complètement
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      // Réinitialiser les buffers et états seulement si on démarre (pas si on reprend)
      if (!isResuming) {
        usbStreamBufferRef.current = ''
        setUsbStreamMeasurements([])
        setUsbStreamLogs([])
        setUsbStreamLastMeasurement(null)
        setUsbStreamLastUpdate(null)
      } else {
        // En reprise, on garde les logs mais on réinitialise le buffer pour les nouvelles données
        usbStreamBufferRef.current = ''
        appendUsbStreamLog('▶️ Reprise du streaming...', 'dashboard')
      }
      
        logger.debug('[USB] Reading...')

      // Démarrer la lecture
      appendUsbStreamLog('🚀 Démarrage du streaming USB...', 'dashboard')
      logger.log('🚀 [USB] Démarrage startReading avec handleUsbStreamChunk')
      
      const stop = await startReading(handleUsbStreamChunk)
      if (!stop || typeof stop !== 'function') {
        const errorMsg = 'startReading n\'a pas retourné de fonction stop valide'
        appendUsbStreamLog(`❌ ${errorMsg}`, 'dashboard')
        throw new Error(errorMsg)
      }
      
      usbStreamStopRef.current = stop
      setUsbStreamStatus('waiting')
      
      logger.log('✅ USB streaming démarré')
      appendUsbStreamLog('✅ Streaming USB démarré - En attente de données...', 'dashboard')
      
      // Plus besoin d'envoyer les commandes "usb" et "start" :
      // - Le firmware détecte automatiquement la connexion série et entre en mode debug
      // - Le streaming est maintenant actif par défaut (streamingActive = true)
      // - Toutes les données sont envoyées automatiquement (débit, batterie, GPS, RSSI)
    } catch (err) {
      logger.error('❌ [USB] Erreur démarrage streaming:', err)
      const errorMsg = err.message || 'Impossible de démarrer le streaming USB'
      setUsbStreamError(errorMsg)
      setUsbStreamStatus('idle')
      appendUsbStreamLog(`❌ Erreur: ${errorMsg}`, 'dashboard')
    }
    }, [ensurePortReady, handleUsbStreamChunk, startReading, appendUsbStreamLog, logger, port, isConnected, write, usbStreamStatus])

  // Fonction interne pour arrêter le streaming (sans logs, réutilisable)
  const stopStreamingInternal = useCallback((silent = false) => {
    if (usbStreamStopRef.current) {
      try {
        if (!silent) {
          logger.debug('[USB] Pause')
        }
        usbStreamStopRef.current()
        if (!silent) {
          logger.log('✅ [USB] Fonction stop exécutée')
        }
      } catch (stopErr) {
        logger.warn('⚠️ [USB] Erreur lors de l\'arrêt du streaming:', stopErr)
      }
      usbStreamStopRef.current = null
    } else if (!silent) {
      logger.log('ℹ️ [USB] Aucun streaming actif à arrêter')
    }
  }, [])

  // Mettre en pause le streaming USB (garde le port connecté et les logs)
  const pauseUsbStreaming = useCallback(() => {
    logger.log('⏸️ [USB] Pause du streaming demandée')
    stopStreamingInternal(true) // Arrêter silencieusement le streaming
    // Ne pas réinitialiser le buffer ni les logs - on garde tout en mémoire
    // Ne pas déconnecter le port - on le garde connecté
    setUsbStreamStatus('paused')
    setUsbStreamError(null)
    appendUsbStreamLog('⏸️ Streaming en pause - Les logs sont conservés', 'dashboard')
    logger.log('✅ [USB] Streaming en pause, port toujours connecté')
  }, [stopStreamingInternal, appendUsbStreamLog])

  // Arrêter complètement le streaming USB (déconnecte le port et réinitialise)
  const stopUsbStreaming = useCallback(() => {
      logger.debug('[USB] Stop streaming')
    stopStreamingInternal(true) // Arrêter silencieusement le streaming
    // Réinitialiser les buffers et logs
    usbStreamBufferRef.current = ''
    setUsbStreamMeasurements([])
    setUsbStreamLogs([])
    setUsbStreamLastMeasurement(null)
    setUsbStreamLastUpdate(null)
    setUsbStreamStatus('idle')
      logger.debug('[USB] Streaming stopped')
  }, [stopStreamingInternal])

  // Détecter un dispositif USB (fonction simplifiée - à compléter avec la logique de détection)
  const detectUSBDevice = useCallback(async (devices = [], fetchWithAuth, API_URL, refetch, notifyDevicesUpdated) => {
    if (!isSupported) {
      logger.warn('Web Serial API non supporté')
      return null
    }

    setCheckingUSB(true)
    try {
      // Logique de détection à implémenter ici
      // Pour l'instant, retourner null
      return null
    } catch (err) {
      logger.error('Erreur détection USB:', err)
      return null
    } finally {
      setCheckingUSB(false)
    }
  }, [isSupported])

  // Connexion automatique dès qu'un port USB est détecté (fonctionne en permanence)
  useEffect(() => {
    if (!isSupported) {
      setAutoDetecting(false)
      return
    }

    // Si déjà connecté, ne rien faire
    if (isConnected && port) {
      return
    }

    let isMounted = true
    let connectionAttemptInProgress = false

    // Fonction pour tenter la connexion automatique
    const attemptAutoConnect = async () => {
      // Éviter les tentatives simultanées
      if (connectionAttemptInProgress) {
        return
      }

      // Si déjà connecté, ne rien faire
      if (isConnected && port) {
        return
      }

      connectionAttemptInProgress = true

      try {
        // Récupérer les ports déjà autorisés
        const ports = await navigator.serial.getPorts()
        
        if (ports.length === 0) {
          // Pas de ports autorisés - c'est normal, l'utilisateur devra autoriser manuellement
          connectionAttemptInProgress = false
          return
        }

        // Essayer de se connecter au premier port disponible
        for (const availablePort of ports) {
          // Vérifier si ce port est déjà utilisé
          if (port === availablePort && isConnected) {
            continue
          }

          // Vérifier si le port est déjà ouvert
          if (availablePort.readable && availablePort.writable) {
            // Port déjà ouvert, vérifier s'il est verrouillé (utilisé par un autre onglet)
            if (availablePort.writable.locked || availablePort.readable.locked) {
              // Port verrouillé par un autre onglet, ne pas essayer de l'ouvrir
              logger.debug('🔌 [USB] Port déjà ouvert et verrouillé par un autre onglet, écoute des données partagées...')
              // Le système de partage gérera l'écoute des données
              connectionAttemptInProgress = false
              return
            }
            
            // Port déjà ouvert et non verrouillé, l'utiliser
            logger.log('🔌 [USB] Port déjà ouvert détecté, connexion automatique...')
            try {
              const connected = await connect(availablePort, 115200)
              if (connected && isMounted) {
                logger.log('✅ [USB] Connexion automatique réussie')
                appendUsbStreamLog('✅ Connexion automatique au dispositif USB établie', 'dashboard')
                
                // Démarrer automatiquement le streaming après connexion
                const streamTimeoutId = setTimeout(async () => {
                  if (isMounted && !usbStreamStopRef.current) {
                    try {
                      logger.log('📡 [USB] Démarrage automatique du streaming...')
                      await startUsbStreaming(availablePort)
                    } catch (streamErr) {
                      logger.warn('⚠️ [USB] Erreur démarrage streaming automatique:', streamErr)
                    }
                  }
                }, 500)
                // Stocker dans une référence pour cleanup si nécessaire
                streamTimeoutRefs.current.push(streamTimeoutId)
                
                connectionAttemptInProgress = false
                return
              }
            } catch (connectErr) {
              logger.debug('⚠️ [USB] Erreur connexion port déjà ouvert:', connectErr.message)
              // Continuer avec le port suivant
              continue
            }
          } else {
            // Port non ouvert, essayer de l'ouvrir
            logger.debug('[USB] Auto-connect')
            try {
              const connected = await connect(availablePort, 115200)
              if (connected && isMounted) {
                logger.log('✅ [USB] Connexion automatique réussie')
                appendUsbStreamLog('✅ Connexion automatique au dispositif USB établie', 'dashboard')
                
                // Démarrer automatiquement le streaming après connexion
                const streamTimeoutId = setTimeout(async () => {
                  if (isMounted && !usbStreamStopRef.current) {
                    try {
                      logger.log('📡 [USB] Démarrage automatique du streaming...')
                      await startUsbStreaming(availablePort)
                    } catch (streamErr) {
                      logger.warn('⚠️ [USB] Erreur démarrage streaming automatique:', streamErr)
                    }
                  }
                }, 500)
                // Stocker dans une référence pour cleanup si nécessaire
                streamTimeoutRefs.current.push(streamTimeoutId)
                
                connectionAttemptInProgress = false
                return
              }
            } catch (connectErr) {
              logger.debug('⚠️ [USB] Erreur connexion port:', connectErr.message)
              // Continuer avec le port suivant
              continue
            }
          }
        }

        connectionAttemptInProgress = false
      } catch (err) {
        logger.debug('⚠️ [USB] Erreur détection/connexion automatique:', err.message)
        connectionAttemptInProgress = false
      }
    }

    // Tentative immédiate au montage
    attemptAutoConnect()

    // Polling périodique pour détecter les nouveaux ports (toutes les 3 secondes)
    const interval = setInterval(() => {
      if (isMounted && !isConnected) {
        attemptAutoConnect()
      }
    }, 3000)

    // Nettoyer à la déconnexion
    return () => {
      isMounted = false
      clearInterval(interval)
      // Nettoyer tous les timeouts de streaming
      streamTimeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId))
      streamTimeoutRefs.current = []
    }
  }, [isSupported, isConnected, port, connect, startUsbStreaming, appendUsbStreamLog])

  // Nettoyer à la déconnexion
  useEffect(() => {
    return () => {
      stopUsbStreaming()
    }
  }, [stopUsbStreaming])

  // Fonction pour configurer le callback d'envoi des mesures à l'API
  const setSendMeasurementCallback = useCallback((callback) => {
    sendMeasurementToApiRef.current = callback
  }, [])

  // Fonction pour définir le callback de mise à jour du firmware_version
  const setUpdateDeviceFirmwareCallback = useCallback((callback) => {
    updateDeviceFirmwareRef.current = callback
  }, [])

  // ============================================================================
  // AUTO-CRÉATION/MISE À JOUR INTELLIGENTE DES DISPOSITIFS USB
  // ============================================================================
  
  /**
   * Fonction pour auto-créer ou mettre à jour un dispositif USB en base de données
   * Cette fonction est appelée automatiquement quand un dispositif USB est détecté
   * 
   * @param {Object} deviceInfo - Informations du dispositif USB détecté
   * @param {Function} fetchWithAuth - Fonction d'authentification
   * @param {string} apiUrl - URL de l'API
   * @returns {Promise<Object|null>} - Le dispositif créé/mis à jour ou null en cas d'erreur
   */
  const autoCreateOrUpdateDevice = useCallback(async (deviceInfo, fetchWithAuth, apiUrl) => {
    if (!deviceInfo) {
      logger.warn('autoCreateOrUpdateDevice: deviceInfo vide')
      return null
    }

    const identifier = deviceInfo.sim_iccid || deviceInfo.device_serial
    
    if (!identifier) {
      logger.warn('autoCreateOrUpdateDevice: aucun identifiant (ICCID ou serial)', deviceInfo)
      return null
    }

    try {
      logger.log(`🔍 [AUTO-CREATE] Vérification dispositif: ${identifier}`)
      
      // Importer fetchJson
      const { fetchJson } = await import('@/lib/api')
      
      // 1. Vérifier si le dispositif existe déjà en BDD
      const devicesResponse = await fetchJson(fetchWithAuth, apiUrl, '/api.php/devices', {}, { requiresAuth: true })
      
      if (!devicesResponse.success) {
        logger.error('❌ Échec récupération dispositifs:', devicesResponse.message)
        return null
      }

      const allDevices = devicesResponse.devices || []
      
      // Chercher le dispositif par ICCID ou serial
      const existingDevice = allDevices.find(d => 
        (deviceInfo.sim_iccid && d.sim_iccid === deviceInfo.sim_iccid) ||
        (deviceInfo.device_serial && d.device_serial === deviceInfo.device_serial)
      )

      if (existingDevice) {
        // 2a. DISPOSITIF EXISTE → Mise à jour
        logger.log(`✅ [AUTO-CREATE] Dispositif trouvé (ID: ${existingDevice.id}), mise à jour...`)
        
        const updateData = {
          last_seen: new Date().toISOString(),
          status: 'usb_connected'
        }
        
        // Mettre à jour firmware si disponible
        if (deviceInfo.firmware_version) {
          updateData.firmware_version = deviceInfo.firmware_version
        }
        
        // Mettre à jour les identifiants si manquants
        if (deviceInfo.sim_iccid && !existingDevice.sim_iccid) {
          updateData.sim_iccid = deviceInfo.sim_iccid
        }
        if (deviceInfo.device_serial && !existingDevice.device_serial) {
          updateData.device_serial = deviceInfo.device_serial
        }

        const updateResponse = await fetchJson(
          fetchWithAuth, 
          apiUrl, 
          `/api.php/devices/${existingDevice.id}`, 
          { method: 'PATCH', body: JSON.stringify(updateData) },
          { requiresAuth: true }
        )

        if (updateResponse.success) {
          logger.log('✅ [AUTO-CREATE] Dispositif mis à jour avec succès')
          return { ...existingDevice, ...updateData }
        } else {
          logger.error('❌ [AUTO-CREATE] Échec mise à jour:', updateResponse.message)
          return existingDevice // Retourner quand même le dispositif existant
        }

      } else {
        // 2b. DISPOSITIF N'EXISTE PAS → Création automatique
        logger.log(`🆕 [AUTO-CREATE] Nouveau dispositif détecté, création automatique...`)
        
        const newDeviceData = {
          device_name: deviceInfo.device_name || `USB-${identifier.slice(-4)}`,
          sim_iccid: deviceInfo.sim_iccid || null,
          device_serial: deviceInfo.device_serial || null,
          firmware_version: deviceInfo.firmware_version || null,
          status: 'usb_connected',
          last_seen: new Date().toISOString()
        }

        const createResponse = await fetchJson(
          fetchWithAuth,
          apiUrl,
          '/api.php/devices',
          { method: 'POST', body: JSON.stringify(newDeviceData) },
          { requiresAuth: true }
        )

        if (createResponse.success) {
          logger.log('✅ [AUTO-CREATE] Nouveau dispositif créé avec succès:', createResponse.device)
          return createResponse.device
        } else {
          logger.error('❌ [AUTO-CREATE] Échec création:', createResponse.message)
          return null
        }
      }

    } catch (error) {
      logger.error('❌ [AUTO-CREATE] Erreur:', error)
      return null
    }
  }, [])

  // Référence pour la fonction auto-create (accessible dans les callbacks)
  const autoCreateOrUpdateDeviceRef = useRef(autoCreateOrUpdateDevice)
  
  useEffect(() => {
    autoCreateOrUpdateDeviceRef.current = autoCreateOrUpdateDevice
  }, [autoCreateOrUpdateDevice])

  const value = {
    // État USB
    usbConnectedDevice,
    setUsbConnectedDevice,
    usbVirtualDevice,
    setUsbVirtualDevice,
    usbDeviceInfo, // Données reçues du dispositif USB en temps réel (uniquement depuis le dispositif)
    usbPortInfo,
    setUsbPortInfo,
    autoDetecting,
    setAutoDetecting,
    checkingUSB,
    setCheckingUSB,
    isConnected,
    isSupported,
    port,
    
    // Streaming USB
    usbStreamStatus,
    usbStreamMeasurements,
    usbStreamLogs,
    usbStreamError,
    usbStreamLastMeasurement,
    usbStreamLastUpdate,
    startUsbStreaming,
    pauseUsbStreaming,
    stopUsbStreaming,
    
    // Fonctions
    detectUSBDevice,
    ensurePortReady,
    requestPort,
    connect,
    disconnect,
    startReading,
    write,
    appendUsbStreamLog,
    clearUsbStreamLogs,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback,
  }

  return (
    <UsbContext.Provider value={value}>
      {children}
    </UsbContext.Provider>
  )
}

export function useUsb() {
  const context = useContext(UsbContext)
  if (!context) {
    throw new Error('useUsb must be used within UsbProvider')
  }
  return context
}

