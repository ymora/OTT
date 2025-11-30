'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useSerialPort } from '@/components/SerialPortManager'
import logger from '@/lib/logger'

const UsbContext = createContext()

export function UsbProvider({ children }) {
  const { port, isConnected, isSupported, requestPort, connect, disconnect, startReading, write } = useSerialPort()
  
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

  // Fonction pour ajouter un log USB
  // source: 'device' pour les logs venant du dispositif, 'dashboard' pour les logs du dashboard
  const appendUsbStreamLog = useCallback((line, source = 'device') => {
    if (!line) return
    setUsbStreamLogs(prev => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, line, timestamp: Date.now(), source }]
      return next.slice(-80)
    })
  }, [])

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

  // Fonction pour envoyer une mesure à l'API avec retry et validation
  const sendMeasurementToApi = useCallback(async (measurement, device) => {
    if (!device || !sendMeasurementToApiRef.current) {
      logger.debug('⚠️ Pas de dispositif ou callback pour envoyer la mesure USB')
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
        logger.warn('❌ Impossible d\'envoyer la mesure USB: pas d\'identifiant disponible', {
          device_name: device.device_name,
          sim_iccid: device.sim_iccid,
          device_serial: device.device_serial
        })
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

      logger.debug('📤 Envoi mesure USB à l\'API:', measurementData)
      
      // Utiliser le système robuste d'envoi avec retry
      const { sendMeasurementWithRetry } = await import('@/lib/measurementSender')
      const result = await sendMeasurementWithRetry(measurementData, sendMeasurementToApiRef.current)
      
      if (result.success) {
        logger.debug('✅ Mesure USB envoyée avec succès')
      } else if (result.queued) {
        logger.info('📦 Mesure USB mise en queue pour retry ultérieur')
      } else {
        logger.warn('⚠️ Échec envoi mesure USB:', result.error)
      }
    } catch (err) {
      logger.error('❌ Erreur envoi mesure USB à l\'API:', err, { device })
    }
  }, [])

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
    
    // Toujours ajouter les logs
    appendUsbStreamLog(trimmed)

    // Parser les messages JSON du firmware
    // Le format unifié envoie un JSON complet avec TOUT : identifiants + mesures + configuration
    if (trimmed.startsWith('{')) {
      try {
        const payload = JSON.parse(trimmed)
        
        // Log TOUS les messages JSON reçus pour debug (seulement les 3 premiers pour éviter le spam)
        if (!payload.seq || payload.seq <= 3 || payload.type === 'device_info' || payload.type === 'device_config') {
          logger.log('📥 JSON reçu:', {
            type: payload.type || payload.mode || 'unknown',
            has_mode: !!payload.mode,
            has_type: !!payload.type,
            keys: Object.keys(payload).slice(0, 10),
            seq: payload.seq,
            flow_lpm: payload.flow_lpm,
            battery_percent: payload.battery_percent,
            has_flow_lpm: payload.flow_lpm !== undefined,
            has_battery_percent: payload.battery_percent !== undefined
          })
        }
        
        // Log pour vérifier la réception des données usb_stream
        const isUsbStreamForLog = payload.mode === 'usb_stream' || 
                                  payload.type === 'usb_stream' || 
                                  (payload.status === 'USB_STREAM' && payload.flow_lpm != null) ||
                                  (payload.flow_lpm != null && payload.battery_percent != null && !payload.type)
        if (isUsbStreamForLog) {
          logger.log('📊 Données usb_stream reçues:', {
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
          })
        }
        
        // Format unifié : tous les messages usb_stream contiennent identifiants + mesures + configuration
        // Détecter le format unifié : si mode/type = usb_stream, c'est le format unifié
        const isUnifiedFormat = payload.mode === 'usb_stream' || payload.type === 'usb_stream' || payload.status === 'USB_STREAM'
        
        // Message device_info : format ancien (compatibilité - seulement si ce n'est PAS le format unifié)
        if (payload.type === 'device_info' && !isUnifiedFormat) {
          if (process.env.NODE_ENV === 'development') {
            logger.debug('📱 Device info reçu')
          }
          
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
            const deviceInfoFromUsb = {
              sim_iccid: payload.sim_iccid || null,
              device_serial: payload.device_serial || null,
              firmware_version: payload.firmware_version || null,
              device_name: payload.device_name || null,
              last_seen: now
            }
            
            setUsbDeviceInfo(prev => ({
              ...prev,
              sim_iccid: deviceInfoFromUsb.sim_iccid || prev?.sim_iccid || null,
              device_serial: deviceInfoFromUsb.device_serial || prev?.device_serial || null,
              firmware_version: deviceInfoFromUsb.firmware_version || prev?.firmware_version || null,
              device_name: deviceInfoFromUsb.device_name || prev?.device_name || null,
              last_seen: now
            }))
            
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
            if (currentDevice) {
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
          if (currentDevice) {
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
      return
    }
    
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
        logger.log('📡 [USB] Démarrage du streaming USB...')
        setUsbStreamStatus('connecting')
      }
      
      // Utiliser le port explicite si fourni, sinon utiliser le port du contexte
      const portToUse = explicitPort || port
      
      // Vérifier si le port est disponible et ouvert
      const portIsOpen = portToUse && portToUse.readable && portToUse.writable
      const portIsConnected = portToUse && isConnected
      
      if (portIsOpen || portIsConnected) {
        logger.log('✅ [USB] Port disponible, démarrage de la lecture')
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
        logger.log('🛑 [USB] Arrêt de l\'ancien streaming')
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
      
      logger.log('📖 [USB] Démarrage de la lecture...')

      // Démarrer la lecture
      const stop = await startReading(handleUsbStreamChunk)
      if (!stop || typeof stop !== 'function') {
        throw new Error('startReading n\'a pas retourné de fonction stop valide')
      }
      
      usbStreamStopRef.current = stop
      setUsbStreamStatus('waiting')
      
      logger.log('✅ [USB] Streaming démarré, en attente de données...')
      
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
          logger.log('⏸️ [USB] Arrêt du streaming...')
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
    logger.log('🛑 [USB] Arrêt complet du streaming demandé')
    stopStreamingInternal(true) // Arrêter silencieusement le streaming
    // Réinitialiser les buffers et logs
    usbStreamBufferRef.current = ''
    setUsbStreamMeasurements([])
    setUsbStreamLogs([])
    setUsbStreamLastMeasurement(null)
    setUsbStreamLastUpdate(null)
    setUsbStreamStatus('idle')
    logger.log('✅ [USB] Streaming complètement arrêté, état réinitialisé')
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
            // Port déjà ouvert, l'utiliser
            logger.log('🔌 [USB] Port déjà ouvert détecté, connexion automatique...')
            try {
              const connected = await connect(availablePort, 115200)
              if (connected && isMounted) {
                logger.log('✅ [USB] Connexion automatique réussie')
                appendUsbStreamLog('✅ Connexion automatique au dispositif USB établie', 'dashboard')
                
                // Démarrer automatiquement le streaming après connexion
                setTimeout(async () => {
                  if (isMounted && !usbStreamStopRef.current) {
                    try {
                      logger.log('📡 [USB] Démarrage automatique du streaming...')
                      await startUsbStreaming(availablePort)
                    } catch (streamErr) {
                      logger.warn('⚠️ [USB] Erreur démarrage streaming automatique:', streamErr)
                    }
                  }
                }, 500)
                
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
            logger.log('🔌 [USB] Tentative de connexion automatique au port...')
            try {
              const connected = await connect(availablePort, 115200)
              if (connected && isMounted) {
                logger.log('✅ [USB] Connexion automatique réussie')
                appendUsbStreamLog('✅ Connexion automatique au dispositif USB établie', 'dashboard')
                
                // Démarrer automatiquement le streaming après connexion
                setTimeout(async () => {
                  if (isMounted && !usbStreamStopRef.current) {
                    try {
                      logger.log('📡 [USB] Démarrage automatique du streaming...')
                      await startUsbStreaming(availablePort)
                    } catch (streamErr) {
                      logger.warn('⚠️ [USB] Erreur démarrage streaming automatique:', streamErr)
                    }
                  }
                }, 500)
                
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

