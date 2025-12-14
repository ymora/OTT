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
  
  // État USB global - UN SEUL état pour tous les dispositifs USB connectés
  // Si le dispositif a un `id` numérique, il est enregistré en base
  // Sinon, c'est un dispositif virtuel (non enregistré)
  const [usbDevice, setUsbDevice] = useState(null)
  
  // Fonction helper pour obtenir le dispositif USB connecté (compatibilité)
  const getUsbDevice = useCallback(() => usbDevice, [usbDevice])
  
  // Fonction helper pour vérifier si le dispositif est enregistré (a un vrai ID)
  const isUsbDeviceRegistered = useCallback(() => {
    if (!usbDevice?.id) return false
    // Vrai ID = nombre ou string qui ne commence pas par 'usb' (usb_info_, usb_temp_, usb-, etc.)
    // Un ID de base de données est soit un nombre, soit une string qui ne commence pas par 'usb'
    return typeof usbDevice.id === 'number' || 
           (typeof usbDevice.id === 'string' && !usbDevice.id.startsWith('usb'))
  }, [usbDevice])
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
  const usbGetConfigSentRef = useRef(false) // Flag pour éviter d'envoyer GET_CONFIG plusieurs fois (évite boucle infinie)
  
  // Batch des logs pour envoi au serveur (pour monitoring à distance)
  const logsToSendRef = useRef([])
  const sentCommandsCacheRef = useRef(new Set()) // Cache pour éviter de renvoyer les mêmes commandes
  
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

  // Fonction pour ajouter un log USB (UNIQUEMENT local, pas d'envoi au serveur)
  // source: 'device' pour les logs venant du dispositif, 'dashboard' pour les logs du dashboard
  const appendUsbStreamLog = useCallback((line, source = 'device') => {
    if (!line) return
    
    const timestamp = Date.now()
    
    // Ajouter au state local pour affichage immédiat uniquement
    // DÉSACTIVÉ: Les logs ne sont plus envoyés au serveur (affichage local uniquement)
    setUsbStreamLogs(prev => {
      const next = [...prev, { id: `${timestamp}-${Math.random()}`, line, timestamp, source }]
      // Limiter à 500 logs en mémoire pour éviter la surcharge
      return next.slice(-500)
    })
    
    // DÉSACTIVÉ: Les logs ne sont plus ajoutés au batch pour envoi au serveur
    // logsToSendRef.current.push({
    //   log_line: line,
    //   log_source: source,
    //   timestamp: timestamp
    // })
    // 
    // // Limiter la taille du buffer (éviter la surcharge mémoire)
    // if (logsToSendRef.current.length > 200) {
    //   logsToSendRef.current = logsToSendRef.current.slice(-200)
    // }
  }, [])
  
  // Fonction pour effacer les logs (RAZ console - uniquement local, rien en base)
  const clearUsbStreamLogs = useCallback(() => {
    setUsbStreamLogs([]) // Vider uniquement la console locale
    logsToSendRef.current = [] // Vider aussi le buffer (même s'il n'est plus utilisé pour envoi serveur)
    logger.log('🗑️ Console USB effacée (local uniquement, rien en base de données)')
    // DÉSACTIVÉ: Les logs ne sont plus envoyés au serveur - RAZ vide seulement l'affichage local
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

  // Fonction pour envoyer les logs USB au serveur (batch)
  const sendLogsToServer = useCallback(async () => {
    // Vérifier qu'il y a des logs à envoyer
    if (logsToSendRef.current.length === 0) {
      return
    }
    
    const currentDevice = usbDevice
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
      // Utiliser l'API_URL depuis le contexte
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
      
      // Vérifier le Content-Type de la réponse
      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')
      
      if (!response.ok) {
        // Si ce n'est pas du JSON, c'est probablement une erreur PHP (HTML)
        let errorMessage = `Erreur HTTP ${response.status}`
        if (!isJson) {
          const text = await response.text().catch(() => '')
          // Extraire le message d'erreur PHP si possible
          const phpErrorMatch = text.match(/<b>(?:Fatal error|Warning|Parse error|Notice):\s*(.+?)(?:<\/b>|$)/i)
          if (phpErrorMatch) {
            errorMessage = `Erreur PHP: ${phpErrorMatch[1].substring(0, 100)}`
          } else {
            errorMessage = `Erreur serveur (${response.status}) - Réponse non-JSON`
          }
          logger.error('⚠️ Erreur envoi logs USB - Réponse HTML:', text.substring(0, 500))
        } else {
          const errorData = await response.json().catch(() => ({}))
          errorMessage = errorData.error || errorMessage
          logger.debug('⚠️ Erreur envoi logs USB:', response.status, errorData)
        }
        
        const fullErrorMsg = `⚠️ Erreur envoi logs USB: ${errorMessage}`
        appendUsbStreamLog(fullErrorMsg, 'dashboard')
        // En cas d'erreur, remettre les logs dans le buffer pour réessayer plus tard
        logsToSendRef.current = [...logsToSend, ...logsToSendRef.current].slice(-200)
      } else {
        // Vérifier que la réponse est bien du JSON
        if (!isJson) {
          const text = await response.text().catch(() => '')
          const errorMsg = `⚠️ Réponse serveur invalide (non-JSON): ${text.substring(0, 100)}`
          logger.error(errorMsg)
          appendUsbStreamLog(errorMsg, 'dashboard')
          // Remettre les logs dans le buffer
          logsToSendRef.current = [...logsToSend, ...logsToSendRef.current].slice(-200)
        } else {
          const result = await response.json().catch(() => ({}))
          const count = result.inserted_count || logsToSend.length
          logger.debug(`✅ ${count} logs USB envoyés au serveur`)
          // Ne pas afficher ce message dans la console pour ne pas masquer les logs du firmware
          // Les logs sont déjà visibles individuellement, ce message est redondant
        }
      }
    } catch (err) {
      const errorMsg = `⚠️ Erreur envoi logs USB au serveur (non bloquant): ${err.message || err}`
      logger.error(errorMsg, err)
      appendUsbStreamLog(errorMsg, 'dashboard')
      // En cas d'erreur, remettre les logs dans le buffer
      logsToSendRef.current = [...logsToSend, ...logsToSendRef.current].slice(-200)
    }
  }, [usbDevice, API_URL])
  
  // DÉSACTIVÉ: Les logs USB ne sont plus envoyés en base de données
  // Les logs sont uniquement affichés localement dans la console
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     sendLogsToServer()
  //   }, 5000) // Envoyer toutes les 5 secondes
  //   
  //   return () => {
  //     clearInterval(interval)
  //     // Envoyer les derniers logs avant de démonter
  //     if (logsToSendRef.current.length > 0) {
  //       sendLogsToServer()
  //     }
  //   }
  // }, [sendLogsToServer])
  
  // Vérifier et envoyer les commandes UPDATE_CONFIG via USB
  useEffect(() => {
    if (!isConnected || !usbDevice || !write || !fetchWithAuth || !API_URL) return
    
    const checkAndSendCommands = async () => {
      try {
        // Récupérer l'ICCID ou serial pour identifier le device
        const device = usbDevice?.sim_iccid || usbDevice?.device_serial
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
        
        // Envoyer chaque commande UPDATE_CONFIG via USB et la marquer comme exécutée
        for (const cmd of data.commands) {
          if (cmd.command === 'UPDATE_CONFIG' && cmd.payload) {
            // Vérifier si la commande a déjà été envoyée dans cette session (sécurité supplémentaire)
            const cmdKey = `${cmd.id}_${cmd.command}`
            if (sentCommandsCacheRef.current.has(cmdKey)) {
              logger.debug(`[USB] Commande ${cmd.id} déjà envoyée dans cette session, marquage comme exécutée...`)
              // Marquer quand même comme exécutée au cas où
              try {
                await fetchWithAuth(
                  `${API_URL}/api.php/devices/commands/ack`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      command_id: cmd.id,
                      device_sim_iccid: device
                    })
                  },
                  { requiresAuth: true }
                )
              } catch (err) {
                logger.debug('[USB] Erreur marquage commande déjà envoyée:', err)
              }
              continue
            }
            
            const payload = typeof cmd.payload === 'string' 
              ? JSON.parse(cmd.payload) 
              : cmd.payload
            
            // Formater la commande pour le firmware (format: config {...})
            const commandLine = `config ${JSON.stringify(payload)}\n`
            await write(commandLine)
            
            logger.log(`📤 [USB] Commande UPDATE_CONFIG envoyée:`, payload)
            
            // Ajouter au cache pour éviter de renvoyer dans la même session
            sentCommandsCacheRef.current.add(cmdKey)
            
            // Marquer la commande comme exécutée dans la base de données
            try {
              const ackResponse = await fetchWithAuth(
                `${API_URL}/api.php/devices/commands/ack`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    command_id: cmd.id,
                    device_sim_iccid: device,
                    status: 'executed',
                    message: 'Commande envoyée via USB'
                  })
                },
                { requiresAuth: true }
              )
              
              if (ackResponse.ok) {
                const ackData = await ackResponse.json()
                if (ackData.success) {
                  logger.debug(`✅ [USB] Commande ${cmd.id} marquée comme exécutée`)
                  // Garder la commande dans le cache pour éviter les renvois multiples
                  // même après marquage réussi (sécurité supplémentaire)
                } else {
                  logger.warn(`⚠️ [USB] Échec marquage commande ${cmd.id}:`, ackData.error)
                }
              } else {
                logger.warn(`⚠️ [USB] Erreur HTTP lors du marquage commande ${cmd.id}:`, ackResponse.status)
              }
            } catch (err) {
              logger.error(`❌ [USB] Erreur lors du marquage commande ${cmd.id} comme exécutée:`, err)
              // Ne pas bloquer si le marquage échoue, mais logger l'erreur
            }
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
    
    return () => {
      clearInterval(interval)
    }
  }, [isConnected, usbDevice, write, fetchWithAuth, API_URL])
  
  // Stockage des mesures USB locales pour comparaison avec OTA
  const usbMeasurementsLocalRef = useRef([])
  
  // État du monitoring OTA
  const [otaMonitoringStatus, setOtaMonitoringStatus] = useState({
    isMonitoring: false,
    lastOtaMeasurement: null,
    lastCheck: null,
    syncStatus: 'unknown', // 'synced' | 'delayed' | 'not_syncing' | 'unknown'
    matchedMeasurements: 0,
    totalUsbMeasurements: 0
  })
  
  // Fonction pour enregistrer une mesure USB locale (pour visualisation et monitoring OTA)
  // ⚠️ IMPORTANT : Le mode USB sert uniquement à visualiser ce qui se passe en live
  // Le firmware continue de fonctionner normalement et d'envoyer en OTA
  // On ne fait PAS d'envoi séparé depuis le dashboard pour éviter les doublons
  const sendMeasurementToApi = useCallback(async (measurement, device) => {
    if (!device) {
      return
    }
    
    try {
      // Priorité : sim_iccid > device_serial > device_name (pour USB-xxx)
      let simIccid = device.sim_iccid
      
      // Si pas d'ICCID, utiliser device_serial
      if (!simIccid || simIccid === 'N/A' || simIccid.length < 10) {
        simIccid = device.device_serial
      }
      
      // Si toujours pas d'identifiant valide, utiliser device_name
      if (!simIccid || simIccid === 'N/A') {
        const nameMatch = device.device_name?.match(/USB-([a-f0-9:]+)/i)
        if (nameMatch && nameMatch[1]) {
          simIccid = nameMatch[1]
        } else {
          simIccid = device.device_name
        }
      }
      
      if (!simIccid || simIccid === 'N/A') {
        logger.debug('⚠️ Mesure USB reçue mais pas d\'identifiant pour monitoring OTA')
        return
      }

      // Enregistrer la mesure USB localement pour visualisation et comparaison avec OTA
      const usbMeasurement = {
        sim_iccid: String(simIccid).trim(),
        flowrate: measurement.flowrate ?? 0,
        battery: measurement.battery ?? null,
        rssi: measurement.rssi ?? null,
        timestamp: measurement.timestamp,
        source: 'usb'
      }
      
      // Ajouter à la liste des mesures USB locales (garder les 50 dernières)
      usbMeasurementsLocalRef.current.push(usbMeasurement)
      if (usbMeasurementsLocalRef.current.length > 50) {
        usbMeasurementsLocalRef.current.shift()
      }

      logger.debug('📊 Mesure USB reçue (visualisation locale):', {
        iccid: usbMeasurement.sim_iccid?.slice(-10),
        flowrate: usbMeasurement.flowrate,
        battery: usbMeasurement.battery,
        timestamp: new Date(usbMeasurement.timestamp).toISOString()
      })
      
      // Log informatif : visualisation uniquement, le firmware envoie normalement en OTA
      const logMessage = `📊 Mesure reçue (USB): Débit=${usbMeasurement.flowrate?.toFixed(2) ?? 0} L/min | Batterie=${usbMeasurement.battery ?? 'N/A'}% | RSSI=${usbMeasurement.rssi ?? 'N/A'} | Le firmware envoie en OTA normalement`
      appendUsbStreamLog(logMessage)
      
      // ⚠️ NE PAS ENVOYER la mesure depuis le dashboard
      // Le firmware envoie déjà en OTA normalement (processus parallèle)
      // Les logs USB montrent en live ce qui se passe (modem, GPS, envoi API)
      // Le monitoring OTA compare les mesures USB locales avec celles qui arrivent dans la BDD
      // Le tableau affiche uniquement ce qui est stocké en base de données (provenant de l'OTA)
      
    } catch (err) {
      logger.error('❌ Erreur enregistrement mesure USB locale:', err)
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

    // Si en pause, ne pas ajouter les logs à l'affichage (mais continuer à traiter les JSON pour les mesures)
    // Note: Cette fonction est déjà protégée par handleUsbStreamChunk qui vérifie usbStreamStatus === 'paused'
    // Mais ajoutons une vérification supplémentaire pour être sûr
    // appendUsbStreamLog sera appelé seulement si on n'est pas en pause (protégé par handleUsbStreamChunk)
    
    // Toujours ajouter les logs pour affichage (sauf si en pause, ce qui est géré par handleUsbStreamChunk)
    appendUsbStreamLog(trimmed)
    // Log uniquement en debug pour éviter le spam
    if (process.env.NODE_ENV === 'development') {
      logger.debug('✅ Log ajouté via appendUsbStreamLog:', trimmed.substring(0, 50))
    }

    // Note: Le dispositif virtuel temporaire est maintenant créé via useEffect qui surveille usbStreamLogs
    // Cela permet de créer le dispositif dès qu'il y a des logs, même si isConnected est temporairement false

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
            status: 'active',
            last_seen: now,
            isVirtual: true,
            fromUsbInfo: true // Flag pour indiquer que c'est depuis device_info
          }
          
          // Mettre à jour le dispositif USB (qu'il soit enregistré ou non)
          setUsbDevice(prev => {
            if (!prev) {
              return deviceInfo
            }
            return {
              ...prev,
              ...deviceInfo,
              firmware_version: deviceInfo.firmware_version || prev.firmware_version,
              last_seen: now
            }
          })
          if (process.env.NODE_ENV === 'development') {
            logger.debug('✅ Dispositif USB créé/mis à jour:', deviceInfo.device_name)
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
                last_seen: now
                // Ne pas mettre à jour le status car la contrainte SQL n'accepte que 'active' ou 'inactive'
                // Pas de last_battery dans device_info, seulement dans les mesures
              })
              
              logger.debug('🔄 Mise à jour base de données (device_info):', {
                identifier,
                firmwareVersion: firmwareVersion || '(non disponible)',
                last_seen: now
              })
              appendUsbStreamLog(`✅ [BASE DE DONNÉES] Informations dispositif envoyées (ID: ${identifier}, firmware: ${firmwareVersion || 'N/A'})`, 'dashboard')
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
              // Informations SIM et réseau
              sim_phone_number: payload.sim_phone_number || null,
              sim_status: payload.sim_status || null,
              network_connected: payload.network_connected !== undefined ? payload.network_connected : null,
              gprs_connected: payload.gprs_connected !== undefined ? payload.gprs_connected : null,
              modem_ready: payload.modem_ready !== undefined ? payload.modem_ready : null,
              last_seen: now
            }
            
            setUsbDeviceInfo(prev => {
              const next = {
                ...prev,
                sim_iccid: deviceInfoFromUsb.sim_iccid || prev?.sim_iccid || null,
                device_serial: deviceInfoFromUsb.device_serial || prev?.device_serial || null,
                firmware_version: deviceInfoFromUsb.firmware_version || prev?.firmware_version || null,
                device_name: deviceInfoFromUsb.device_name || prev?.device_name || null,
                // Informations SIM et réseau (mettre à jour si disponibles)
                sim_phone_number: deviceInfoFromUsb.sim_phone_number || prev?.sim_phone_number || null,
                sim_status: deviceInfoFromUsb.sim_status || prev?.sim_status || null,
                network_connected: deviceInfoFromUsb.network_connected !== undefined ? deviceInfoFromUsb.network_connected : (prev?.network_connected || null),
                gprs_connected: deviceInfoFromUsb.gprs_connected !== undefined ? deviceInfoFromUsb.gprs_connected : (prev?.gprs_connected || null),
                modem_ready: deviceInfoFromUsb.modem_ready !== undefined ? deviceInfoFromUsb.modem_ready : (prev?.modem_ready || null),
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
            // Générer un nom intelligent depuis les identifiants disponibles
            let deviceName = payload.device_name
            if (!deviceName || deviceName === 'USB-En attente...' || deviceName === 'USB-Device') {
              if (payload.sim_iccid) {
                deviceName = `OTT-${payload.sim_iccid.slice(-4)}`
              } else if (payload.device_serial) {
                deviceName = payload.device_serial
              } else {
                deviceName = `USB-${payload.sim_iccid?.slice(-4) || payload.device_serial?.slice(-4) || 'XXXX'}`
              }
            }
            
            const deviceInfo = {
              id: `usb_info_${Date.now()}`,
              device_name: deviceName,
              sim_iccid: payload.sim_iccid || null,
              device_serial: payload.device_serial || null,
              firmware_version: payload.firmware_version || null,
              status: 'active',
              last_seen: now,
              isVirtual: true,
              fromUsbInfo: true
            }
            
            // Mettre à jour le dispositif USB (qu'il soit enregistré ou non)
            setUsbDevice(prev => {
              if (!prev) {
                logger.log('✅ [USB] Dispositif USB créé:', deviceInfo.device_name)
                appendUsbStreamLog(`✅ Dispositif USB détecté: ${deviceInfo.device_name} (ICCID: ${deviceInfo.sim_iccid?.slice(-10) || 'N/A'}, Serial: ${deviceInfo.device_serial || 'N/A'})`, 'dashboard')
                return deviceInfo
              }
              return {
                ...prev,
                ...deviceInfo,
                firmware_version: deviceInfo.firmware_version || prev.firmware_version,
                last_seen: now,
                // Conserver les autres propriétés existantes
                sim_iccid: deviceInfo.sim_iccid || prev.sim_iccid,
                device_serial: deviceInfo.device_serial || prev.device_serial,
                device_name: deviceInfo.device_name || prev.device_name,
                // Conserver la configuration si elle existe déjà
                config: prev.config || null
              }
            })
            
            // Mettre à jour la base de données
            if (updateDeviceFirmwareRef.current) {
              const identifier = payload.sim_iccid || payload.device_serial || payload.device_name
              if (identifier) {
                const firmwareVersion = payload.firmware_version || ''
                updateDeviceFirmwareRef.current(identifier, firmwareVersion, {
                  last_seen: now
                  // Ne pas mettre à jour le status car la contrainte SQL n'accepte que 'active' ou 'inactive'
                })
              }
            }
          }
          
          // 2. Extraire et stocker la configuration
          // Détecter si c'est une réponse GET_CONFIG/GET_STATUS (contient type: "config_response")
          const isConfigResponse = payload.type === 'config_response' || 
                                   (payload.mode === 'usb_stream' && payload.type === 'config_response')
          
          // Log de débogage pour config_response
          if (isConfigResponse) {
            logger.log('🔍🔍🔍 [USB] CONFIG_RESPONSE DÉTECTÉ:', {
              type: payload.type,
              mode: payload.mode,
              has_sleep_minutes: payload.sleep_minutes != null,
              has_firmware_version: !!payload.firmware_version,
              has_device_serial: !!payload.device_serial,
              has_sim_iccid: !!payload.sim_iccid
            })
            appendUsbStreamLog('🔍 CONFIG_RESPONSE détecté - Configuration complète reçue', 'dashboard')
          }
          
          // Si c'est une réponse GET_CONFIG, elle contient TOUTE la configuration
          // Sinon, on extrait seulement les champs essentiels des messages de streaming
          const hasConfigData = isConfigResponse || // Réponse GET_CONFIG contient toujours toute la config
                                payload.sleep_minutes != null || payload.measurement_duration_ms != null || 
                                payload.calibration_coefficients // Champs essentiels seulement dans le streaming
          
          if (hasConfigData) {
            // Si c'est une réponse GET_CONFIG, utiliser directement toutes les valeurs
            // Sinon (message de streaming), fusionner seulement les champs essentiels avec la config existante
            const existingConfig = usbDeviceInfo?.config || usbDevice?.config || {}
            
            const deviceConfigFromUsb = isConfigResponse 
              ? {
                  // Réponse GET_CONFIG : utiliser toutes les valeurs directement (config complète)
                  sleep_minutes: payload.sleep_minutes ?? null,
                  measurement_duration_ms: payload.measurement_duration_ms ?? null,
                  calibration_coefficients: payload.calibration_coefficients 
                    ? (Array.isArray(payload.calibration_coefficients) 
                        ? payload.calibration_coefficients 
                        : [payload.calibration_coefficients[0] || 0, payload.calibration_coefficients[1] || 1, payload.calibration_coefficients[2] || 0])
                    : [0, 1, 0],
                  airflow_passes: payload.airflow_passes ?? null,
                  airflow_samples_per_pass: payload.airflow_samples_per_pass ?? null,
                  airflow_delay_ms: payload.airflow_delay_ms ?? null,
                  send_every_n_wakeups: payload.send_every_n_wakeups ?? null,
                  gps_enabled: payload.gps_enabled !== undefined ? payload.gps_enabled : null,
                  roaming_enabled: payload.roaming_enabled !== undefined ? payload.roaming_enabled : null,
                  watchdog_seconds: payload.watchdog_seconds ?? null,
                  modem_boot_timeout_ms: payload.modem_boot_timeout_ms ?? null,
                  sim_ready_timeout_ms: payload.sim_ready_timeout_ms ?? null,
                  network_attach_timeout_ms: payload.network_attach_timeout_ms ?? null,
                  modem_max_reboots: payload.modem_max_reboots ?? null,
                  apn: payload.apn || null,
                  operator: payload.operator || null,
                  sim_pin: payload.sim_pin || null,
                  ota_primary_url: payload.ota_primary_url || null,
                  ota_fallback_url: payload.ota_fallback_url || null,
                  ota_md5: payload.ota_md5 || null
                }
              : {
                  // Message de streaming : fusionner seulement les champs essentiels avec la config existante
                  ...existingConfig,
                  sleep_minutes: payload.sleep_minutes !== undefined ? payload.sleep_minutes : (existingConfig.sleep_minutes ?? null),
                  measurement_duration_ms: payload.measurement_duration_ms !== undefined ? payload.measurement_duration_ms : (existingConfig.measurement_duration_ms ?? null),
                  calibration_coefficients: payload.calibration_coefficients 
                    ? (Array.isArray(payload.calibration_coefficients) 
                        ? payload.calibration_coefficients 
                        : [payload.calibration_coefficients[0] || 0, payload.calibration_coefficients[1] || 1, payload.calibration_coefficients[2] || 0])
                    : (existingConfig.calibration_coefficients || [0, 1, 0])
                }
            
            if (isConfigResponse) {
              logger.log('✅✅✅ Configuration COMPLÈTE reçue via GET_CONFIG:', JSON.stringify(deviceConfigFromUsb, null, 2))
              appendUsbStreamLog('✅ Configuration complète reçue du dispositif (GET_CONFIG)', 'dashboard')
              
              // Mettre à jour aussi firmware_version et device_serial depuis config_response
              if (payload.firmware_version) {
                setUsbDeviceInfo(prev => ({
                  ...prev,
                  firmware_version: payload.firmware_version
                }))
              }
              if (payload.device_serial) {
                setUsbDeviceInfo(prev => ({
                  ...prev,
                  device_serial: payload.device_serial
                }))
              }
              if (payload.sim_iccid) {
                setUsbDeviceInfo(prev => ({
                  ...prev,
                  sim_iccid: payload.sim_iccid
                }))
              }
            } else {
              logger.log('✅ Configuration extraite du format unifié:', JSON.stringify(deviceConfigFromUsb, null, 2))
              const configSummary = [
                deviceConfigFromUsb.sleep_minutes != null ? `Sleep=${deviceConfigFromUsb.sleep_minutes}min` : null,
                deviceConfigFromUsb.measurement_duration_ms != null ? `Durée=${deviceConfigFromUsb.measurement_duration_ms}ms` : null,
                deviceConfigFromUsb.calibration_coefficients ? `Cal=[${deviceConfigFromUsb.calibration_coefficients.join(',')}]` : null,
                deviceConfigFromUsb.airflow_passes != null ? `Passes=${deviceConfigFromUsb.airflow_passes}` : null,
                deviceConfigFromUsb.airflow_samples_per_pass != null ? `Samples=${deviceConfigFromUsb.airflow_samples_per_pass}` : null,
                deviceConfigFromUsb.airflow_delay_ms != null ? `Délai=${deviceConfigFromUsb.airflow_delay_ms}ms` : null
              ].filter(Boolean).join(' | ')
              appendUsbStreamLog(`⚙️ Configuration reçue: ${configSummary || 'N/A'}`)
            }
            
            setUsbDeviceInfo(prev => ({
              ...prev,
              config: deviceConfigFromUsb
            }))
            
            // Mettre à jour aussi usbDevice avec la configuration si elle existe
            if (usbDevice) {
              setUsbDevice(prev => ({
                ...prev,
                config: deviceConfigFromUsb
              }))
            }
            
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
            const currentDevice = usbDevice
            logger.log('🔍 [USB-CONTEXT] Check envoi mesure:', {
              hasCurrentDevice: !!currentDevice,
              currentDevice: currentDevice ? currentDevice.device_name : 'AUCUN',
              usbDevice: usbDevice ? usbDevice.device_name : 'null',
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
                    // Ne pas mettre à jour le status car la contrainte SQL n'accepte que 'active' ou 'inactive'
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
          const currentDevice = usbDevice
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
                  last_seen: now
                  // Ne pas mettre à jour le status car la contrainte SQL n'accepte que 'active' ou 'inactive'
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
                // Log ajouté dans updateDevice (UsbStreamingTab.js) pour éviter doublon
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
  }, [appendUsbStreamLog, sendMeasurementToApi, usbDevice, usbDeviceInfo])

  // Créer le dispositif virtuel temporaire dès qu'il y a des logs USB
  useEffect(() => {
    // Si on a des logs mais pas de dispositif virtuel, créer un dispositif temporaire
    // Cela permet d'afficher le dispositif dans le tableau même avant de recevoir les identifiants
    if (usbStreamLogs.length > 0 && !usbDevice) {
      // Générer un nom intelligent pour le dispositif temporaire
      // Le nom sera mis à jour quand les identifiants arriveront
      const tempDevice = {
        id: `usb_temp_${Date.now()}`,
        device_name: 'USB-En attente...', // Sera mis à jour quand les identifiants arriveront
        sim_iccid: null,
        device_serial: null,
        firmware_version: null,
        status: 'active',
        last_seen: new Date().toISOString(),
        isVirtual: true,
        isTemporary: true // Flag pour indiquer que c'est temporaire
      }
      setUsbDevice(tempDevice)
      logger.log('✅ [USB] Dispositif virtuel temporaire créé (dès qu\'il y a des logs):', tempDevice)
      appendUsbStreamLog('ℹ️ Dispositif USB détecté - En attente des identifiants...', 'dashboard')
    }
  }, [usbStreamLogs.length, usbDevice, appendUsbStreamLog])

  // Gestion des chunks de streaming
  const handleUsbStreamChunk = useCallback((chunk) => {
    if (!chunk) {
      logger.debug('⚠️ handleUsbStreamChunk: chunk vide ou null')
      return
    }

    // Si le streaming est en pause, ne pas traiter les données (arrêt de l'affichage des logs)
    if (usbStreamStatus === 'paused') {
      logger.debug('⏸️ [USB] Streaming en pause - données ignorées')
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
    logger.debug(`📦 [USB] ${parts.length} ligne(s) extraite(s) du chunk`)
    let jsonCount = 0
    parts.forEach((line, index) => {
      if (line || line === '') {
        const trimmed = line.trim()
        logger.debug(`📝 [USB] Traitement ligne ${index + 1}/${parts.length}: ${trimmed.substring(0, 50)}`)
        
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
        
        // TOUJOURS appeler processUsbStreamLine pour que les logs soient ajoutés
        logger.debug(`📤 [USB] Appel processUsbStreamLine pour ligne ${index + 1}`)
        processUsbStreamLine(line)
      }
    })
    
    // Log un résumé si plusieurs lignes traitées (mais pas de JSON)
    if (parts.length > 0 && jsonCount === 0) {
      logger.debug(`📥 ${parts.length} ligne(s) de log du firmware traitée(s)`)
    }
    
    // Ne mettre à jour le status que si on n'est pas en pause
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
      
      // Demander la configuration complète au démarrage (SEULEMENT si on démarre, pas si on reprend)
      // Cela permet de récupérer TOUS les paramètres en une seule fois
      // CRITIQUE: Ne pas envoyer GET_CONFIG si on reprend depuis une pause (évite boucle infinie)
      if (!isResuming) {
        try {
          await new Promise(resolve => setTimeout(resolve, 500)) // Attendre que le streaming soit stable
          if (write && port && !usbGetConfigSentRef.current) {
            const getConfigCommand = JSON.stringify({ command: 'GET_CONFIG' }) + '\n'
            await write(getConfigCommand)
            usbGetConfigSentRef.current = true // Marquer comme envoyé pour éviter répétition
            logger.log('📤 [USB] Commande GET_CONFIG envoyée pour récupérer toute la configuration')
            appendUsbStreamLog('📤 Demande de configuration complète...', 'dashboard')
          }
        } catch (configErr) {
          logger.warn('⚠️ [USB] Erreur envoi GET_CONFIG:', configErr)
          // Ne pas bloquer si la commande échoue, on récupérera la config progressivement
        }
      }
      
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
    }, [ensurePortReady, handleUsbStreamChunk, startReading, appendUsbStreamLog, logger, port, isConnected, write])

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
    usbGetConfigSentRef.current = false // Réinitialiser le flag GET_CONFIG à l'arrêt complet
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
        
        // Log uniquement en debug, pas dans la console utilisateur (trop verbeux)
        logger.debug(`[USB] attemptAutoConnect: ${ports.length} port(s) autorisé(s) trouvé(s)`)
        
        if (ports.length === 0) {
          // Pas de ports autorisés - c'est normal, l'utilisateur devra autoriser manuellement
          // Ne pas spammer avec des messages, la détection automatique fonctionnera une fois qu'un port sera autorisé
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
                  if (isMounted) {
                    // Vérifier si un streaming est déjà en cours
                    if (usbStreamStopRef.current) {
                      logger.log('📡 [USB] Streaming déjà en cours, pas besoin de redémarrer')
                      appendUsbStreamLog('ℹ️ Streaming déjà actif', 'dashboard')
                      return
                    }
                    try {
                      logger.log('📡 [USB] Démarrage automatique du streaming...')
                      appendUsbStreamLog('🚀 Démarrage automatique du streaming USB...', 'dashboard')
                      await startUsbStreaming(availablePort)
                    } catch (streamErr) {
                      logger.warn('⚠️ [USB] Erreur démarrage streaming automatique:', streamErr)
                      appendUsbStreamLog(`❌ Erreur démarrage streaming: ${streamErr.message || streamErr}`, 'dashboard')
                    }
                  } else {
                    logger.warn('⚠️ [USB] Composant démonté avant démarrage streaming')
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
                  if (isMounted) {
                    // Vérifier si un streaming est déjà en cours
                    if (usbStreamStopRef.current) {
                      logger.log('📡 [USB] Streaming déjà en cours, pas besoin de redémarrer')
                      appendUsbStreamLog('ℹ️ Streaming déjà actif', 'dashboard')
                      return
                    }
                    try {
                      logger.log('📡 [USB] Démarrage automatique du streaming...')
                      appendUsbStreamLog('🚀 Démarrage automatique du streaming USB...', 'dashboard')
                      await startUsbStreaming(availablePort)
                    } catch (streamErr) {
                      logger.warn('⚠️ [USB] Erreur démarrage streaming automatique:', streamErr)
                      appendUsbStreamLog(`❌ Erreur démarrage streaming: ${streamErr.message || streamErr}`, 'dashboard')
                    }
                  } else {
                    logger.warn('⚠️ [USB] Composant démonté avant démarrage streaming')
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
  // NOTE: Auto-création désactivée
  // Les dispositifs USB doivent être enregistrés manuellement via le modal
  // ============================================================================

  // Fonction pour vérifier si les mesures OTA arrivent dans la base de données
  const checkOtaSync = useCallback(async (deviceIdentifier, deviceId = null) => {
    if (!deviceIdentifier || !fetchWithAuth || !API_URL) {
      return null
    }

    try {
      // Importer fetchJson
      const { fetchJson } = await import('@/lib/api')
      
      setOtaMonitoringStatus(prev => ({ ...prev, isMonitoring: true, lastCheck: Date.now() }))
      
      let device = null
      
      // Si on a un deviceId numérique, récupérer directement le dispositif
      // L'API n'accepte que les IDs numériques pour /devices/{id}
      if (deviceId && /^\d+$/.test(String(deviceId))) {
        try {
          const response = await fetchJson(
            fetchWithAuth,
            API_URL,
            `/api.php/devices/${deviceId}`,
            { method: 'GET' },
            { requiresAuth: true }
          )
          
          if (response.success && response.device) {
            device = response.device
          }
        } catch (error) {
          // Si l'endpoint échoue, on continue avec la recherche dans la liste complète
          logger.debug('⚠️ Erreur récupération device par ID, fallback sur liste complète:', error)
        }
      }
      
      // Sinon, récupérer tous les dispositifs et chercher
      if (!device) {
        const response = await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/devices`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (response.success && response.devices && response.devices.devices) {
          // Chercher par sim_iccid ou device_serial
          device = response.devices.devices.find(d => 
            d.sim_iccid === deviceIdentifier || 
            d.device_serial === deviceIdentifier
          )
        }
      }
      
      if (!device) {
        setOtaMonitoringStatus(prev => ({ 
          ...prev, 
          isMonitoring: false,
          syncStatus: 'unknown'
        }))
        return null
      }

      // Récupérer les mesures USB locales récentes (dernières 2 minutes)
      const twoMinutesAgo = Date.now() - 2 * 60 * 1000
      const usbMeasurements = usbMeasurementsLocalRef.current
        .filter(m => {
          const match = m.sim_iccid === deviceIdentifier || 
                       m.sim_iccid === device.sim_iccid ||
                       m.sim_iccid === device.device_serial
          return match && new Date(m.timestamp).getTime() >= twoMinutesAgo
        })
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)) // Plus récentes en premier

      // Comparer avec les données du dispositif dans la BDD
      const deviceLastSeen = device.last_seen ? new Date(device.last_seen).getTime() : null
      const deviceLastBattery = device.last_battery
      const deviceLastFlowrate = device.last_flowrate
      
      let matchedCount = 0
      let syncStatus = 'unknown'
      const now = Date.now()

      if (usbMeasurements.length === 0) {
        syncStatus = 'unknown'
      } else if (!deviceLastSeen) {
        syncStatus = 'not_syncing' // Dispositif jamais vu en OTA
      } else {
        // Vérifier si la dernière mesure USB correspond aux données OTA
        const lastUsbMeasurement = usbMeasurements[0]
        const timeSinceLastOta = (now - deviceLastSeen) / 1000 // secondes
        
        // Si une mesure OTA a été reçue dans les 30 dernières secondes
        if (timeSinceLastOta <= 30) {
          // Comparer les valeurs
          const batteryDiff = Math.abs((lastUsbMeasurement.battery || 0) - (deviceLastBattery || 0))
          const flowrateDiff = Math.abs((lastUsbMeasurement.flowrate || 0) - (deviceLastFlowrate || 0))
          
          // Si les valeurs sont proches, considérer comme synchronisé
          if (batteryDiff <= 2 && flowrateDiff <= 0.5) {
            matchedCount = 1
            syncStatus = 'synced'
          } else {
            syncStatus = 'delayed' // Valeurs différentes mais timing OK
          }
        } else {
          syncStatus = 'delayed' // Pas de mesure OTA récente
        }
      }

      setOtaMonitoringStatus({
        isMonitoring: false,
        lastOtaMeasurement: deviceLastSeen ? {
          timestamp: device.last_seen,
          battery: deviceLastBattery,
          flowrate: deviceLastFlowrate,
          rssi: device.last_rssi
        } : null,
        lastCheck: Date.now(),
        syncStatus,
        matchedMeasurements: matchedCount,
        totalUsbMeasurements: usbMeasurements.length
      })

      return {
        syncStatus,
        matchedCount,
        totalUsbCount: usbMeasurements.length,
        deviceLastSeen: device.last_seen,
        deviceData: {
          last_battery: deviceLastBattery,
          last_flowrate: deviceLastFlowrate,
          last_rssi: device.last_rssi
        }
      }
    } catch (error) {
      logger.error('❌ Erreur vérification OTA:', error)
      setOtaMonitoringStatus(prev => ({ 
        ...prev, 
        isMonitoring: false,
        syncStatus: 'unknown'
      }))
      return null
    }
  }, [fetchWithAuth, API_URL])

  const value = {
    // État USB - UN SEUL état pour tous les dispositifs USB connectés
    usbDevice,
    setUsbDevice,
    getUsbDevice,
    isUsbDeviceRegistered,
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
    
    // Monitoring OTA
    otaMonitoringStatus,
    checkOtaSync,
    usbMeasurementsLocal: usbMeasurementsLocalRef.current,
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

