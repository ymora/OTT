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
  const updateDeviceFirmwareRef = useRef(null) // Callback pour mettre à jour le firmware_version dans la base

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
    if (trimmed.startsWith('{')) {
      try {
        const payload = JSON.parse(trimmed)
        
        // Message device_info : infos du dispositif envoyées dès la connexion USB
        if (payload.type === 'device_info') {
          logger.log('📱 Infos dispositif reçues:', payload)
          
          // Stocker les données reçues du dispositif (uniquement depuis le dispositif USB)
          const deviceInfoFromUsb = {
            sim_iccid: payload.iccid || null,
            device_serial: payload.serial || null,
            firmware_version: payload.firmware_version || null,
            device_name: payload.device_name || null,
            last_seen: new Date().toISOString()
          }
          
          // Mettre à jour l'état avec les données reçues du dispositif
          setUsbDeviceInfo(prev => ({
            ...prev,
            ...deviceInfoFromUsb,
            // Conserver les valeurs précédentes si nouvelles valeurs sont null
            sim_iccid: deviceInfoFromUsb.sim_iccid || prev?.sim_iccid || null,
            device_serial: deviceInfoFromUsb.device_serial || prev?.device_serial || null,
            firmware_version: deviceInfoFromUsb.firmware_version || prev?.firmware_version || null,
            device_name: deviceInfoFromUsb.device_name || prev?.device_name || null
          }))
          
          // Créer ou mettre à jour un dispositif virtuel avec ces infos (pour compatibilité)
          const deviceInfo = {
            id: `usb_info_${Date.now()}`,
            device_name: payload.device_name || `USB-${payload.iccid?.slice(-4) || payload.serial?.slice(-4) || 'XXXX'}`,
            sim_iccid: payload.iccid || null,
            device_serial: payload.serial || null,
            firmware_version: payload.firmware_version || null,
            status: 'usb_connected',
            last_seen: new Date().toISOString(),
            isVirtual: true,
            fromUsbInfo: true // Flag pour indiquer que c'est depuis device_info
          }
          
          // Si on n'a pas encore de dispositif USB connecté, utiliser ces infos
          if (!usbConnectedDevice && !usbVirtualDevice) {
            setUsbVirtualDevice(deviceInfo)
            logger.log('✅ Dispositif USB créé depuis device_info:', deviceInfo.device_name)
          } else if (usbConnectedDevice) {
            // Mettre à jour le dispositif connecté avec les infos en temps réel
            setUsbConnectedDevice(prev => ({
              ...prev,
              ...deviceInfo,
              firmware_version: deviceInfo.firmware_version || prev.firmware_version,
              last_seen: new Date().toISOString()
            }))
            logger.log('✅ Dispositif USB connecté mis à jour avec device_info')
          } else if (usbVirtualDevice) {
            // Mettre à jour le dispositif virtuel existant avec les vraies infos
            setUsbVirtualDevice(prev => ({
              ...prev,
              ...deviceInfo,
              firmware_version: deviceInfo.firmware_version || prev.firmware_version,
              last_seen: new Date().toISOString()
            }))
            logger.log('✅ Dispositif USB mis à jour avec device_info')
          }
          
          // Mettre à jour automatiquement les informations du dispositif dans la base de données
          // Utiliser ICCID, serial, ou device_name pour trouver le dispositif
          if (updateDeviceFirmwareRef.current) {
            // Essayer ICCID d'abord, puis serial, puis device_name
            const identifier = payload.iccid || payload.serial || payload.device_name
            if (identifier && payload.firmware_version) {
              updateDeviceFirmwareRef.current(identifier, payload.firmware_version, {
                last_seen: new Date().toISOString(),
                status: 'usb_connected',
                // Pas de last_battery dans device_info, seulement dans les mesures
              })
            }
          }
          
          return
        }
        
        // Message usb_stream : mesure de streaming
        if (payload.mode === 'usb_stream') {
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
              firmware_version: payload.firmware_version || null // Extraire la version depuis le payload
            },
          }

          setUsbStreamMeasurements(prev => {
            const next = [...prev, measurement]
            return next.slice(-120)
          })
          setUsbStreamLastMeasurement(measurement)
          setUsbStreamLastUpdate(Date.now())
          setUsbStreamError(null)
          setUsbStreamStatus('running')
          
          // Mettre à jour les données reçues du dispositif USB (uniquement depuis le dispositif)
          if (payload.firmware_version) {
            setUsbDeviceInfo(prev => ({
              ...prev,
              firmware_version: payload.firmware_version,
              last_seen: new Date().toISOString()
            }))
          }
          
          // Envoyer la mesure à l'API si un dispositif USB est connecté
          const currentDevice = usbConnectedDevice || usbVirtualDevice
          if (currentDevice) {
            sendMeasurementToApi(measurement, currentDevice)
            
            // Mettre à jour les informations du dispositif dans la base de données
            // Cette mise à jour est complémentaire à celle faite par l'API lors de l'envoi de la mesure
            // Elle permet de mettre à jour même si la mesure n'a pas encore été envoyée à l'API
            // On met à jour à chaque mesure pour avoir les informations les plus récentes
            if (updateDeviceFirmwareRef.current) {
              // Utiliser les données du dispositif USB en priorité, puis fallback sur currentDevice
              const identifier = usbDeviceInfo?.sim_iccid || usbDeviceInfo?.device_serial || 
                                 currentDevice.sim_iccid || currentDevice.device_serial || currentDevice.device_name
              if (identifier) {
                // Utiliser firmware_version depuis le payload (données en temps réel du dispositif)
                const firmwareVersion = payload.firmware_version || usbDeviceInfo?.firmware_version || currentDevice.firmware_version
                // Mettre à jour même si firmwareVersion n'est pas disponible (pour last_battery, last_seen, status)
                // Utiliser une chaîne vide si firmwareVersion n'est pas disponible pour permettre la mise à jour
                updateDeviceFirmwareRef.current(identifier, firmwareVersion || '', {
                  last_seen: new Date().toISOString(),
                  status: 'usb_connected',
                  last_battery: measurement.battery !== null && measurement.battery !== undefined ? measurement.battery : undefined
                })
              }
            }
          }
          
          return
        }
      } catch (err) {
        logger.debug('JSON invalide:', trimmed, err)
        return
      }
    }
  }, [appendUsbStreamLog, sendMeasurementToApi, usbConnectedDevice, usbVirtualDevice])

  // Gestion des chunks de streaming
  const handleUsbStreamChunk = useCallback((chunk) => {
    if (!chunk) {
      logger.debug('📥 Chunk vide reçu')
      return
    }
    
    logger.log('📥 Chunk reçu:', chunk.length, 'caractères')
    logger.debug('📥 Contenu chunk:', chunk.substring(0, Math.min(100, chunk.length)))
    
    usbStreamBufferRef.current += chunk
    const parts = usbStreamBufferRef.current.split(/\r?\n/)
    usbStreamBufferRef.current = parts.pop() ?? ''
    
    logger.debug('📥 Lignes extraites:', parts.length)
    
    parts.forEach((line, index) => {
      if (line || line === '') {
        logger.debug(`📥 Traitement ligne ${index + 1}/${parts.length}:`, line.substring(0, Math.min(50, line.length)))
        processUsbStreamLine(line)
      }
    })
    
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
      
      // Ajouter un log initial pour confirmer que le streaming est actif
      appendUsbStreamLog('📡 Streaming USB démarré - En attente de données du dispositif...', 'dashboard')
      
      // IMPORTANT: Envoyer la commande "usb" au dispositif pour activer le streaming continu
      // Le firmware attend cette commande dans les 3 secondes après le boot
      // Sans cette commande, le firmware n'enverra que les logs de boot, pas le streaming continu
      // Attendre un peu pour que la lecture soit bien démarrée et que le writer soit prêt
      await new Promise(resolve => setTimeout(resolve, 500))
      
      try {
        logger.log('📤 [USB] Envoi de la commande "usb" au dispositif pour activer le streaming continu...')
        logger.log('📤 [USB] Vérification writer avant envoi...')
        
        // Vérifier que le port est bien ouvert et que le writer existe
        const portForWrite = explicitPort || port
        if (!portForWrite || !portForWrite.writable) {
          throw new Error('Port writable non disponible pour l\'envoi de la commande')
        }
        
        logger.log('📤 [USB] Port writable OK, envoi de la commande "usb"...')
        const commandSent = await write('usb\n')
        
        // Attendre un peu pour que le firmware entre en mode USB
        await new Promise(resolve => setTimeout(resolve, 500))
        
        // Envoyer la commande "start" pour démarrer le streaming continu
        logger.log('📤 [USB] Envoi de la commande "start" pour démarrer le streaming continu...')
        await write('start\n')
        
        if (commandSent) {
          logger.log('✅ [USB] Commande "usb" envoyée avec succès - Le firmware devrait maintenant envoyer des données en continu')
          appendUsbStreamLog('📤 Commande "usb" envoyée au dispositif pour activer le streaming continu...', 'dashboard')
        } else {
          logger.warn('⚠️ [USB] Échec de l\'envoi de la commande "usb" - Le streaming continu ne démarrera pas')
          logger.warn('⚠️ [USB] Vérifiez que le port est bien connecté et que le writer est disponible')
          appendUsbStreamLog('⚠️ Échec de l\'envoi de la commande "usb" - Le streaming continu ne démarrera pas', 'dashboard')
        }
      } catch (writeErr) {
        logger.error('❌ [USB] Erreur lors de l\'envoi de la commande "usb":', writeErr)
        logger.error('❌ [USB] Détails:', writeErr.message || writeErr)
        appendUsbStreamLog(`❌ Erreur envoi commande: ${writeErr.message || writeErr}`, 'dashboard')
        // Ne pas arrêter le streaming, continuer quand même (peut-être que le firmware envoie déjà des données)
      }
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

  // Détection automatique en permanence
  useEffect(() => {
    if (!isSupported) {
      setAutoDetecting(false)
      return
    }

    if (!autoDetecting) return

    // Détection automatique périodique
    const interval = setInterval(async () => {
      try {
        const ports = await navigator.serial.getPorts()
        if (ports.length > 0 && !usbConnectedDevice && !usbVirtualDevice) {
          logger.debug('🔍 Détection automatique USB...')
          // La détection complète sera gérée par les pages qui utilisent le contexte
        }
      } catch (err) {
        logger.debug('Erreur détection auto:', err)
      }
    }, 5000) // Vérifier toutes les 5 secondes

    return () => clearInterval(interval)
  }, [isSupported, autoDetecting, usbConnectedDevice, usbVirtualDevice])

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

