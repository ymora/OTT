'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useUsb } from '@/contexts/UsbContext'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData, useEntityRestore, useEntityArchive, useEntityPermanentDelete, useSmartDeviceRefresh } from '@/hooks'
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
  // Flag pour éviter le double démarrage du streaming
  const isStartingStreamRef = useRef(false)
  // Référence stable pour startUsbStreaming pour éviter les re-renders
  const startUsbStreamingRef = useRef(null)
  
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
    usbDevice,
    setUsbDevice,
    isUsbDeviceRegistered,
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
    write,
    startUsbStreaming,
    pauseUsbStreaming,
    appendUsbStreamLog,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback,
    checkOtaSync
  } = usbContext
  
  // Mettre à jour la référence stable
  useEffect(() => {
    startUsbStreamingRef.current = startUsbStreaming
  }, [startUsbStreaming])
  
  // NOTE: Le démarrage automatique du streaming est géré par UsbContext
  // Pas besoin de le redémarrer ici pour éviter les doublons
  
  const { fetchWithAuth, API_URL, user } = useAuth()
  
  // Helper pour vérifier les permissions
  const hasPermission = (permission) => {
    if (!permission) return true
    if (user?.role_name === 'admin') return true
    return user?.permissions?.includes(permission) || false
  }
  
  // Helper pour normaliser les identifiants (fonction pure, mémorisée pour éviter les recréations)
  const normalizeId = useCallback((val) => val ? String(val).trim().replace(/\s+/g, '') : '', [])

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
    
    // Erreurs (priorité haute) - Rouge
    const errorPatterns = [
      'ERROR', '❌', 'ÉCHEC', 'FAIL', 'FATAL', 'EXCEPTION',
      'ERREUR JSON', 'ERREUR PARSING', 'DATABASE ERROR', 'ACCÈS REFUSÉ'
    ]
    if (errorPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'error'
    }
    
    // Avertissements - Rouge/Orange
    const warningPatterns = [
      'WARN', '⚠️', 'WARNING', 'ATTENTION', 'TIMEOUT',
      'COMMANDE INCONNUE', 'NON DISPONIBLE', 'VÉRIFIER'
    ]
    if (warningPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'warning'
    }
    
    // Commandes envoyées - Violet
    const commandPatterns = [
      '📤', 'ENVOI', 'COMMANDE', 'SEND', 'REQUEST', 'DEMANDE',
      'UPDATE_CONFIG', 'GET_CONFIG', 'RESET_CONFIG', 'FLASH'
    ]
    if (commandPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'command'
    }
    
    // Confirmations d'exécution - Vert
    const successPatterns = [
      '✅', 'SUCCESS', 'SUCCÈS', 'RÉUSSI', 'CONFIGURÉ', 'CONNECTÉ',
      'ATTACHÉ', 'DÉMARRÉ', 'TERMINÉ', 'COMPLÉTÉ'
    ]
    if (successPatterns.some(pattern => logLine.includes(pattern) || line.includes(pattern))) {
      return 'success'
    }
    
    // Logs du dispositif (MODEM, SENSOR, GPS, etc.) - Bleu
    // Détecter la provenance entre crochets
    const provenanceMatch = logLine.match(/^\[([^\]]+)\]/)
    if (provenanceMatch) {
      const provenance = provenanceMatch[1].toUpperCase()
      if (provenance.includes('MODEM') || provenance.includes('SENSOR') || 
          provenance.includes('GPS') || provenance.includes('USB') ||
          provenance.includes('CFG') || provenance.includes('NETWORK')) {
        return 'device'
      }
    }
    
    // Modem (sans crochets)
    const modemPatterns = [
      'MODEM', 'SIM', 'CSQ', 'RSSI', 'SIGNAL',
      'OPÉRATEUR', 'ATTACHÉ', 'ENREGISTREMENT', 'APN', 'GPRS', '4G', 'LTE'
    ]
    if (modemPatterns.some(pattern => line.includes(pattern))) {
      return 'device'
    }
    
    // GPS
    const gpsPatterns = [
      'GPS', 'LATITUDE', 'LONGITUDE', 'SATELLITE',
      'FIX', 'COORDONNÉES', 'GÉOLOCALISATION'
    ]
    if (gpsPatterns.some(pattern => line.includes(pattern))) {
      return 'device'
    }
    
    // Sensor
    const sensorPatterns = [
      'AIRFLOW', 'FLOW', 'BATTERY', 'BATTERIE',
      'MESURE', 'CAPTURE', 'ADC', 'V_ADC', 'V_BATT'
    ]
    if (sensorPatterns.some(pattern => line.includes(pattern))) {
      return 'device'
    }
    
    return 'default'
  }, [])

  // Fonction pour obtenir la classe CSS selon la catégorie
  const getLogColorClass = useCallback((category, isDashboard) => {
    if (isDashboard) {
      // Logs du dashboard : différencier commandes, confirmations, etc.
      if (category === 'command') {
        return 'text-purple-400 dark:text-purple-300' // Violet pour commandes
      }
      if (category === 'success') {
        return 'text-green-400 dark:text-green-300' // Vert pour confirmations
      }
      if (category === 'error' || category === 'warning') {
        return 'text-red-400 dark:text-red-300' // Rouge pour erreurs/warnings
      }
      return 'text-blue-400 dark:text-blue-300' // Bleu par défaut pour dashboard
    }
    
    // Logs du dispositif
    switch (category) {
      case 'error':
        return 'text-red-400 dark:text-red-300' // Rouge pour erreurs
      case 'warning':
        return 'text-orange-400 dark:text-orange-300' // Orange pour warnings
      case 'command':
        return 'text-purple-400 dark:text-purple-300' // Violet pour commandes
      case 'success':
        return 'text-green-400 dark:text-green-300' // Vert pour confirmations
      case 'device':
        return 'text-blue-400 dark:text-blue-300' // Bleu pour logs dispositif
      default:
        return 'text-gray-300 dark:text-gray-400'
    }
  }, [])
  
  // Toggle pour afficher les archives
  const [showArchived, setShowArchived] = useState(false)
  
  // Charger tous les dispositifs pour le tableau
  // Le hook useApiData se recharge automatiquement quand l'endpoint change (showArchived)
  // IMPORTANT: Passer un string unique au lieu d'un tableau pour éviter les problèmes de structure de données
  const endpoint = useMemo(() => 
    showArchived ? '/api.php/devices?include_deleted=true' : '/api.php/devices', 
    [showArchived]
  )
  const { data: devicesData, loading: devicesLoading, refetch: refetchDevices, invalidateCache } = useApiData(
    endpoint,
    { requiresAuth: true, autoLoad: !!user, cacheTTL: 3000 } // Cache de 3 secondes (optimisé pour le polling adaptatif)
  )
  
  // Référence stable pour refetchDevices pour éviter les boucles infinies
  const refetchDevicesRef = useRef(refetchDevices)
  useEffect(() => {
    refetchDevicesRef.current = refetchDevices
  }, [refetchDevices])
  
  // Référence pour suivre l'état de connexion précédent
  const previousIsConnectedRef = useRef(isConnected)
  
  // Rafraîchir la liste quand on se connecte
  useEffect(() => {
    if (!previousIsConnectedRef.current && isConnected) {
      invalidateCache()
      const timeoutId = setTimeout(() => refetchDevicesRef.current(), 200)
      return () => clearTimeout(timeoutId)
    }
    previousIsConnectedRef.current = isConnected
  }, [isConnected, invalidateCache])
  
  // Rafraîchissement intelligent : polling adaptatif + événements + debounce
  // - Si USB connecté : polling toutes les 30 secondes (pour voir les updates USB en temps réel)
  // - Si web seulement : polling toutes les 60 secondes (1 minute - les dispositifs sont en deep sleep)
  // - Événements déclenchent un refetch avec debounce de 2 secondes
  // - Évite les refetch redondants si plusieurs événements arrivent rapidement
  useSmartDeviceRefresh(refetchDevices, {
    isUsbConnected: isConnected || !!usbDevice,
    enabled: !!user,
    pollingIntervalUsb: 30000, // 30 secondes si USB connecté (réduit pour éviter rafraîchissement excessif)
    pollingIntervalWeb: 60000, // 60 secondes si web seulement (les dispositifs sont en deep sleep)
    eventDebounceMs: 2000 // 2 secondes de debounce pour les événements
  })
  
  // Utiliser le hook unifié pour la restauration
  const { restore: handleRestoreDeviceDirect, restoring: restoringDevice } = useEntityRestore('devices', {
    onSuccess: (device) => {
      logger.log(`✅ Dispositif "${device.device_name || device.sim_iccid}" restauré avec succès`)
      appendUsbStreamLog(`✅ Dispositif "${device.device_name || device.sim_iccid}" restauré`, 'dashboard')
      // Si on était en mode archivé, basculer vers la vue normale pour voir le dispositif restauré
      if (showArchived) {
        setShowArchived(false)
      }
      // Debounce pour éviter les refetch multiples rapides qui causent des sauts visuels
      invalidateCache()
      createTimeoutWithCleanup(async () => {
        await refetchDevicesRef.current()
      }, 500)
    },
    onError: (errorMessage) => {
      logger.error('Erreur restauration device:', errorMessage)
      appendUsbStreamLog(`❌ Erreur restauration: ${errorMessage}`, 'dashboard')
    },
    invalidateCache,
    refetch: refetchDevices
  })
  
  // Utiliser le hook unifié pour l'archivage
  const { archive: handleArchiveDevice, archiving: archivingDevice } = useEntityArchive({
    fetchWithAuth,
    API_URL,
    entityType: 'devices',
    refetch: refetchDevices,
    onSuccess: (device) => {
      logger.log(`✅ Dispositif "${device.device_name || device.sim_iccid}" archivé`)
      appendUsbStreamLog(`✅ Dispositif "${device.device_name || device.sim_iccid}" archivé`, 'dashboard')
      setSuccessMessage('✅ Dispositif archivé')
      invalidateCache()
      createTimeoutWithCleanup(() => {
        refetchDevicesRef.current()
      }, 500)
      createTimeoutWithCleanup(() => setSuccessMessage(null), 5000)
    },
    onError: (errorMessage) => {
      logger.error('Erreur archivage dispositif:', errorMessage)
      appendUsbStreamLog(`❌ Erreur archivage: ${errorMessage}`, 'dashboard')
    },
    invalidateCache,
    currentUser: user
  })
  
  // Utiliser le hook unifié pour la suppression définitive
  const { permanentDelete: handlePermanentDeleteDevice, deleting: deletingDevice } = useEntityPermanentDelete({
    fetchWithAuth,
    API_URL,
    entityType: 'devices',
    refetch: refetchDevices,
    onSuccess: (device) => {
      logger.log(`✅ Dispositif "${device.device_name || device.sim_iccid}" supprimé définitivement`)
      appendUsbStreamLog(`✅ Dispositif "${device.device_name || device.sim_iccid}" supprimé définitivement`, 'dashboard')
      setSuccessMessage('✅ Dispositif supprimé définitivement')
      invalidateCache()
      createTimeoutWithCleanup(() => {
        refetchDevicesRef.current()
      }, 300)
      createTimeoutWithCleanup(() => setSuccessMessage(null), 5000)
    },
    onError: (errorMessage) => {
      logger.error('Erreur suppression dispositif:', errorMessage)
      appendUsbStreamLog(`❌ Erreur suppression: ${errorMessage}`, 'dashboard')
    },
    invalidateCache
  })
  // Extraire les dispositifs depuis la réponse API
  const allDevicesFromApi = useMemo(() => {
    if (!devicesData) return []
    if (Array.isArray(devicesData)) return devicesData
    if (devicesData.devices && Array.isArray(devicesData.devices)) return devicesData.devices
    if (devicesData.data?.devices && Array.isArray(devicesData.data.devices)) return devicesData.data.devices
    return []
  }, [devicesData])
  
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
  const devicesToDisplay = useMemo(() => {
    let displayList = []
    
    if (showArchived) {
      // Afficher uniquement les dispositifs archivés
      displayList = archivedDevices
    } else {
      // Afficher les dispositifs actifs + le dispositif virtuel USB s'il n'existe pas en base
      displayList = [...devices]
      
      // IMPORTANT: Ne PAS créer de dispositif virtuel ici - la logique de synchronisation USB (useEffect SYNC)
      // s'occupe déjà de créer/mettre à jour usbDevice. On ajoute seulement usbDevice si :
      // 1. Il existe (usbDevice n'est pas null)
      // 2. Il n'est PAS enregistré en base (!isUsbDeviceRegistered())
      // 3. Il n'est PAS déjà dans la liste (pas déjà ajouté)
      // 4. Le dispositif n'existe pas déjà dans displayList avec le même ICCID/Serial
      // Ajouter le dispositif USB virtuel s'il n'est pas enregistré en base
      if (usbDevice && !isUsbDeviceRegistered() && isConnected) {
        const usbIccid = normalizeId(usbDevice.sim_iccid)
        const usbSerial = normalizeId(usbDevice.device_serial)
        
        // Vérifier qu'il n'est pas déjà dans la liste
        // Si le dispositif est en cours de détection (pas d'ICCID/Serial), l'afficher quand même
        // SAUF si un dispositif avec ICCID existe déjà
        const alreadyInList = displayList.some(d => {
          const dIccid = normalizeId(d.sim_iccid)
          const dSerial = normalizeId(d.device_serial)
          
          // Si on a ICCID ou Serial ET qu'ils correspondent, c'est un doublon
          if ((usbIccid && dIccid && usbIccid === dIccid) ||
              (usbSerial && dSerial && usbSerial === dSerial)) {
            return true
          }
          
          return false
        })
        
        // Ne pas ajouter si déjà dans la liste
        if (!alreadyInList) {
          displayList = [usbDevice, ...displayList]
        }
      }
    }
    
    return displayList
    }, [showArchived, devices, archivedDevices, usbDevice, isUsbDeviceRegistered, allDevices, isConnected, usbDeviceInfo, normalizeId])
  
  // ========== STREAMING LOGS EN TEMPS RÉEL (pour admin à distance) ==========
  const [remoteLogs, setRemoteLogs] = useState([])
  const [isStreamingRemote, setIsStreamingRemote] = useState(false)
  const lastLogTimestampRef = useRef(0)
  
  // Charger les logs distants depuis l'API - OPTIMISÉ avec useMemo pour les URLs
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
        // OPTIMISATION : Transformation des logs
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
            // OPTIMISATION : Utiliser Map pour dédupliquer plus efficacement O(n) au lieu de O(n²)
            const uniqueMap = new Map()
            merged.forEach(log => uniqueMap.set(log.id, log))
            const unique = Array.from(uniqueMap.values())
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
    if (user?.role_name !== 'admin' || isConnected || usbDevice || !allDevices || allDevices.length === 0) {
      return
    }
    
    // Vérifier quel device a des logs USB récents (< 30s = LIVE streaming)
    const checkLiveDevices = async () => {
      try {
        // Chercher parmi tous les devices celui qui a des logs USB très récents
        const thirtySecondsAgo = Date.now() - 30000
        
        // OPTIMISATION N+1: Faire tous les appels en parallèle avec Promise.all au lieu d'une boucle séquentielle
        const deviceChecks = allDevices.map(async (device) => {
          const deviceId = device.sim_iccid || device.device_serial || device.id
          
          try {
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
                return { device, isLive: true }
              }
            }
          } catch (err) {
            logger.debug(`Erreur vérification logs pour device ${deviceId}:`, err)
          }
          
          return { device, isLive: false }
        })
        
        // Attendre tous les résultats en parallèle
        const results = await Promise.all(deviceChecks)
        
        // Trouver le premier device LIVE
        const liveDevice = results.find(r => r.isLive)
        if (liveDevice) {
          logger.log(`🔴 [AUTO-SELECT] Device LIVE détecté: ${liveDevice.device.device_name} (logs < 30s)`)
          setUsbDevice({ ...liveDevice.device, isVirtual: true })
        }
      } catch (err) {
        logger.debug('Erreur détection device LIVE:', err)
      }
    }
    
    checkLiveDevices()
  }, [user, isConnected, usbDevice, allDevices, setUsbDevice, fetchWithAuth, API_URL])
  
  // Déterminer si on doit utiliser les logs distants (admin sans USB local)
  const shouldUseRemoteLogs = useMemo(() => {
    return user?.role_name === 'admin' && !isConnected && usbDevice
  }, [user, isConnected, usbDevice])
  
  // Fusionner les logs locaux et distants et filtrer les logs trop verbeux
  const allLogs = useMemo(() => {
    logger.log(`🔵 [UsbStreamingTab] allLogs recalculé - usbStreamLogs: ${usbStreamLogs.length}, remoteLogs: ${remoteLogs.length}, isConnected: ${isConnected}, status: ${usbStreamStatus}`)
    
    let logs = []
    
    // Si on a une connexion USB locale ET des logs locaux, utiliser uniquement les logs locaux
    // ⚠️ IMPORTANT: Utiliser les logs locaux même si isConnected est false temporairement
    // car les logs peuvent être reçus avant que la connexion soit complètement établie
    if (usbStreamLogs.length > 0) {
      logs = usbStreamLogs
      logger.log(`✅ [UsbStreamingTab] Utilisation de ${logs.length} log(s) local(aux)`)
      if (logs.length > 0) {
        logger.log(`📋 [UsbStreamingTab] Premier log: "${logs[0]?.line || String(logs[0])}"`)
        logger.log(`📋 [UsbStreamingTab] Dernier log: "${logs[logs.length - 1]?.line || String(logs[logs.length - 1])}"`)
      }
    }
    // Sinon, utiliser les logs distants (pour admin) s'il y en a
    else if (shouldUseRemoteLogs && remoteLogs.length > 0) {
      logs = remoteLogs
      logger.log(`✅ [UsbStreamingTab] Utilisation de ${logs.length} log(s) distant(s)`)
    } else {
      logger.warn(`⚠️ [UsbStreamingTab] Aucun log disponible (usbStreamLogs: ${usbStreamLogs.length}, remoteLogs: ${remoteLogs.length})`)
    }
    
    // ⚠️ AUCUN FILTRAGE : Afficher TOUS les logs reçus
    // Limiter uniquement à 500 logs affichés pour éviter le blocage de l'interface
    const limitedLogs = logs.slice(-500)
    logger.log(`📊 [UsbStreamingTab] ${limitedLogs.length} log(s) affiché(s) (sur ${logs.length} total)`)
    return limitedLogs
  }, [usbStreamLogs, remoteLogs, isConnected, shouldUseRemoteLogs, usbStreamStatus])
  
  // Mémoriser les logs formatés pour éviter de refaire le traitement à chaque render
  const formattedLogs = useMemo(() => {
    logger.log(`🔵 [UsbStreamingTab] formattedLogs recalculé - allLogs: ${allLogs.length} log(s)`)
    if (allLogs.length > 0) {
      logger.log(`📋 [UsbStreamingTab] Premier log brut:`, allLogs[0])
      logger.log(`📋 [UsbStreamingTab] Dernier log brut:`, allLogs[allLogs.length - 1])
    }
    
    const formatted = allLogs.map((log) => {
      // Gérer les cas où log peut être un string ou un objet
      const logLine = typeof log === 'string' ? log : (log?.line || String(log) || '')
      const logSource = typeof log === 'object' && log !== null ? (log.source || 'device') : 'device'
      const isRemote = typeof log === 'object' && log !== null ? (log.isRemote || false) : false
      
      const isDashboard = logSource === 'dashboard'
      
      // Essayer de formater le JSON si c'est un USB stream
      const formattedJson = formatJsonLog(logLine)
      let displayLine = formattedJson || logLine
      
      // Extraire ou déterminer la provenance entre crochets
      let provenance = null
      let cleanLine = displayLine
      
      // Chercher si une provenance existe déjà dans le log
      const provenanceMatch = displayLine.match(/^(\[[^\]]+\])/)
      if (provenanceMatch) {
        provenance = provenanceMatch[1]
        cleanLine = displayLine.replace(/^\[[^\]]+\]\s*/, '')
      } else {
        // Si pas de provenance, en ajouter une selon le contexte
        if (isDashboard) {
          // Logs du dashboard : déterminer le type
          if (displayLine.includes('📤') || displayLine.includes('ENVOI') || displayLine.includes('COMMANDE')) {
            provenance = '[CMD]'
          } else if (displayLine.includes('✅') || displayLine.includes('SUCCESS') || displayLine.includes('RÉUSSI')) {
            provenance = '[OK]'
          } else if (displayLine.includes('❌') || displayLine.includes('ERROR') || displayLine.includes('ÉCHEC')) {
            provenance = '[ERR]'
          } else if (displayLine.includes('⚠️') || displayLine.includes('WARN') || displayLine.includes('ATTENTION')) {
            provenance = '[WARN]'
          } else {
            provenance = '[DASHBOARD]'
          }
        } else {
          // Logs du dispositif : essayer de détecter le type
          if (displayLine.includes('MODEM') || displayLine.includes('SIM') || displayLine.includes('APN') || displayLine.includes('RSSI')) {
            provenance = '[MODEM]'
          } else if (displayLine.includes('SENSOR') || displayLine.includes('AIRFLOW') || displayLine.includes('FLOW') || displayLine.includes('BATTERY')) {
            provenance = '[SENSOR]'
          } else if (displayLine.includes('GPS') || displayLine.includes('LATITUDE') || displayLine.includes('LONGITUDE')) {
            provenance = '[GPS]'
          } else if (displayLine.includes('CFG') || displayLine.includes('CONFIG')) {
            provenance = '[CFG]'
          } else if (displayLine.includes('USB') || displayLine.includes('STREAM')) {
            provenance = '[USB]'
          } else {
            provenance = '[DEVICE]'
          }
        }
      }
      
      const category = analyzeLogCategory(displayLine)
      const colorClass = getLogColorClass(category, isDashboard)
      
      return {
        id: typeof log === 'object' && log !== null ? (log.id || `${Date.now()}-${Math.random()}`) : `${Date.now()}-${Math.random()}`,
        timestamp: typeof log === 'object' && log !== null ? (log.timestamp || Date.now()) : Date.now(),
        source: logSource,
        line: logLine,
        isDashboard,
        isRemote,
        provenance,
        cleanLine,
        colorClass
      }
    })
    
    logger.log(`✅ [UsbStreamingTab] formattedLogs créé: ${formatted.length} log(s) formaté(s)`)
    if (formatted.length > 0) {
      logger.log(`📋 [UsbStreamingTab] Premier log formaté:`, formatted[0])
    }
    
    return formatted
  }, [allLogs, formatJsonLog, analyzeLogCategory, getLogColorClass])
  
  // Log quand les logs changent pour debug
  useEffect(() => {
    logger.log(`🔵 [UsbStreamingTab] RENDU - allLogs: ${allLogs.length}, formattedLogs: ${formattedLogs.length}, usbStreamStatus: ${usbStreamStatus}`)
    if (allLogs.length > 0) {
      logger.log(`📋 [UsbStreamingTab] Premier log:`, allLogs[0])
    }
    if (formattedLogs.length > 0) {
      logger.log(`📋 [UsbStreamingTab] Premier log formaté:`, formattedLogs[0])
    }
  }, [allLogs.length, formattedLogs.length, usbStreamStatus])
  
  // STREAMING AUTOMATIQUE en temps réel pour les admins
  useEffect(() => {
    if (!shouldUseRemoteLogs || !usbDevice) {
      setIsStreamingRemote(false)
      setRemoteLogs([])
      lastLogTimestampRef.current = 0
      return
    }
    
    const deviceId = usbDevice.sim_iccid || usbDevice.device_serial || usbDevice.device_name
    
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
  }, [shouldUseRemoteLogs, usbDevice, loadRemoteLogs])
  
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
        appendUsbStreamLog(`✅ [BASE DE DONNÉES] Mesure enregistrée avec succès (device_id: ${result.device_id || 'N/A'}, flowrate: ${measurement.flowrate || 'N/A'}, battery: ${measurement.battery || 'N/A'}%)`, 'dashboard')
        
        // Rafraîchir les données après l'enregistrement
        createTimeoutWithCleanup(() => {
          logger.log('🔄 Rafraîchissement des dispositifs...')
          refetchDevicesRef.current()
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
            status: updateData.status || 'active',
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
              appendUsbStreamLog(`✅ [BASE DE DONNÉES] Dispositif créé automatiquement en base (ID: ${result.device?.id || identifier})`, 'dashboard')
              
              // Rafraîchir la liste des dispositifs
              createTimeoutWithCleanup(() => {
                refetchDevicesRef.current()
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
          const updatedFields = Object.keys(updatePayload).filter(k => updatePayload[k] !== undefined)
          if (updatedFields.length > 0) {
            appendUsbStreamLog(`✅ [BASE DE DONNÉES] Dispositif ${device.id} mis à jour (${updatedFields.join(', ')})`, 'dashboard')
          }
          createTimeoutWithCleanup(() => {
            refetchDevicesRef.current()
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
  
  // États pour les messages de succès
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
  
  // Debug: logger les changements d'état du modal
  useEffect(() => {
    logger.debug('[UsbStreamingTab] État modal - showDeviceModal:', showDeviceModal, 'editingDevice:', editingDevice)
    if (showDeviceModal) {
      logger.debug('[UsbStreamingTab] ✅ Modal dispositif OUVERT, editingDevice:', editingDevice)
    } else {
      logger.debug('[UsbStreamingTab] ❌ Modal dispositif FERMÉ')
    }
  }, [showDeviceModal, editingDevice])
  
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
  
  // Valeurs calculées mémorisées pour éviter les recalculs (définies AVANT les useEffect qui les utilisent)
  const isStreaming = useMemo(() => 
    usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting',
    [usbStreamStatus]
  )
  
  // Monitoring OTA : vérifier périodiquement si les mesures arrivent via OTA
  useEffect(() => {
    if (!isStreaming || !usbDevice) {
      return
    }
    
    const device = usbDevice
    const identifier = device.sim_iccid || device.device_serial
    // ID du dispositif dans la BDD si disponible (uniquement si numérique)
    // Les IDs temporaires comme "usb_info_123456" ne sont pas valides pour l'API
    const deviceId = device.id && /^\d+$/.test(String(device.id)) ? device.id : null
    
    if (!identifier || !checkOtaSync) {
      return
    }
    
    // Vérifier immédiatement
    checkOtaSync(identifier, deviceId)
    
    // Vérifier toutes les 10 secondes
    const interval = setInterval(() => {
      checkOtaSync(identifier, deviceId)
    }, 10000)
    
    return () => clearInterval(interval)
  }, [isStreaming, usbDevice, checkOtaSync])
  const isPaused = useMemo(() => usbStreamStatus === 'paused', [usbStreamStatus])
  const isReady = useMemo(() => isConnected || isStreaming || isPaused || dbDeviceData, [isConnected, isStreaming, isPaused, dbDeviceData])
  // isDisabled : seulement pour les actions (pas pour l'affichage des données)
  const isDisabled = useMemo(() => !isConnected, [isConnected])
  
  // ========== SYNCHRONISATION DISPOSITIF USB ==========
  // Créer un dispositif virtuel temporaire pour que les callbacks soient appelés
  // La création en base se fait automatiquement via callbacks → /api.php/devices/measurements
  const wasConnectedRef = useRef(false)
  // Références pour accéder aux dernières valeurs sans les inclure dans les dépendances (évite boucles infinies)
  const allDevicesRef = useRef([])
  const usbDeviceRef = useRef(null)
  
  // Mettre à jour les références à chaque changement
  useEffect(() => {
    allDevicesRef.current = allDevices
  }, [allDevices])
  
  useEffect(() => {
    usbDeviceRef.current = usbDevice
  }, [usbDevice])
  
  // Mémoriser les identifiants USB pour éviter les re-renders inutiles
  const usbIdentifiers = useMemo(() => ({
    iccid: normalizeId(usbDeviceInfo?.sim_iccid),
    serial: normalizeId(usbDeviceInfo?.device_serial),
    name: usbDeviceInfo?.device_name,
    firmware: usbDeviceInfo?.firmware_version
  }), [
    usbDeviceInfo?.sim_iccid,
    usbDeviceInfo?.device_serial,
    usbDeviceInfo?.device_name,
    usbDeviceInfo?.firmware_version
  ])
  
  // Synchronisation simple du dispositif USB avec la base
  useEffect(() => {
    if (!isConnected) {
      wasConnectedRef.current = false
      return
    }
    
    // Rafraîchir la liste à la première connexion
    if (!wasConnectedRef.current) {
      wasConnectedRef.current = true
      invalidateCache()
      const timeoutId = createTimeoutWithCleanup(() => refetchDevicesRef.current(), 200)
      // Utilise createTimeoutWithCleanup pour nettoyage automatique
    }
    
    // Si on a des identifiants, chercher en base
    const normalizedIccid = usbIdentifiers.iccid
    const normalizedSerial = usbIdentifiers.serial
    
    if (normalizedIccid || normalizedSerial) {
      const existingDevice = allDevicesRef.current.find(d => {
        const dbIccid = normalizeId(d.sim_iccid)
        const dbSerial = normalizeId(d.device_serial)
        return (normalizedIccid && dbIccid && normalizedIccid === dbIccid) ||
               (normalizedSerial && dbSerial && normalizedSerial === dbSerial)
      })
      
      if (existingDevice && (!usbDeviceRef.current || usbDeviceRef.current.id !== existingDevice.id)) {
        setUsbDevice({ ...existingDevice, isVirtual: false })
        return
      }
    }
    
    // Créer un dispositif virtuel si pas trouvé en base
    // IMPORTANT: Ne créer le dispositif QUE si on a au moins l'ICCID ou le Serial
    // Utiliser le device_name envoyé par le firmware (OTT-xxxx) au lieu de USB-xxxx
    if (!usbDeviceRef.current || usbDeviceRef.current.id?.startsWith('usb_virtual')) {
      // Attendre d'avoir au moins un identifiant (ICCID ou Serial) avant de créer le dispositif
      if (!normalizedIccid && !normalizedSerial) {
        // Pas encore d'identifiant, ne pas créer de dispositif
        // Les logs USB continuent de s'afficher en bas de page
        // Une fois l'ICCID détecté, le dispositif sera créé
        return
      }
      
      // On a l'ICCID ou le Serial, créer le dispositif
      // IMPORTANT: Utiliser le device_name envoyé par le firmware (priorité 1)
      // Le firmware envoie déjà le nom au format OTT-xxxx (buildDeviceName dans le firmware)
      const deviceName = usbDeviceInfo?.device_name || 
        (usbIdentifiers.iccid ? `USB-${usbIdentifiers.iccid.slice(-4)}` : 
         usbIdentifiers.serial ? `USB-${usbIdentifiers.serial.slice(-4)}` : 
         'USB-????')
      
      const newDevice = {
        id: `usb_virtual_${Date.now()}`,
        device_name: deviceName,
        sim_iccid: usbDeviceInfo?.sim_iccid || null,
        device_serial: usbDeviceInfo?.device_serial || null,
        firmware_version: usbDeviceInfo?.firmware_version || null,
        status: 'active',
        last_seen: new Date().toISOString(),
        isVirtual: true
      }
      
      if (!usbDeviceRef.current || 
          usbDeviceRef.current.sim_iccid !== newDevice.sim_iccid ||
          usbDeviceRef.current.device_serial !== newDevice.device_serial) {
        setUsbDevice(newDevice)
      }
    }
  }, [isConnected, usbIdentifiers, invalidateCache, normalizeId])
  // IMPORTANT: Surveiller isConnected et usbIdentifiers (mémorisé pour éviter les boucles)
  // PAS allDevices, pas usbDevice, pas usbDeviceInfo directement (causerait boucle infinie)
  // Les setters sont stables et n'ont pas besoin d'être dans les dépendances
  // NOTE: allDevices est utilisé dans le useEffect mais pas dans les dépendances car il change
  // trop souvent et causerait des boucles. On se fie aux identifiants USB uniquement.
  // ========== FIN SYNCHRONISATION USB ==========
  
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
    const interval = setInterval(loadAvailablePorts, 5000)
    return () => clearInterval(interval)
  }, [isSupported, loadAvailablePorts])

  // Synchroniser le port sélectionné avec le port connecté
  useEffect(() => {
    if (!isSupported || !isConnected || !port) return
    
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
  }, [isSupported, isConnected, port, loadAvailablePorts])

  // Charger les données de la base de données
  useEffect(() => {
    if (!fetchWithAuth || !API_URL || loadingDbData) return
    
    const identifier = usbDeviceInfo?.sim_iccid || usbDeviceInfo?.device_serial || usbDeviceInfo?.device_name
    
    // Si on a déjà des données DB qui correspondent, ne pas recharger
    if (dbDeviceData && identifier) {
      const matches = dbDeviceData.sim_iccid === identifier || 
                      dbDeviceData.device_serial === identifier || 
                      dbDeviceData.device_name === identifier
      if (matches) return
    }
    
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
          const device = identifier 
            ? response.devices.devices.find((d) => 
                d.sim_iccid === identifier || 
                d.device_serial === identifier || 
                d.device_name === identifier
              )
            : response.devices.devices[0]
          
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
            if (!usbStreamLastMeasurement && !usbDeviceInfo) {
              setDataSource('database')
            }
          }
        }
      } catch (err) {
        if (!err.message?.includes('Impossible de contacter l\'API')) {
          logger.error('[DebugTab] Erreur chargement données DB:', err)
        }
      } finally {
        setLoadingDbData(false)
      }
    }
    
    loadDbDeviceData()
  }, [fetchWithAuth, API_URL, usbDeviceInfo?.sim_iccid, usbDeviceInfo?.device_serial, usbDeviceInfo?.device_name, dbDeviceData, loadingDbData, usbStreamLastMeasurement, usbDeviceInfo])
  
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
        if (isConnected && port && !isStartingStreamRef.current) {
          isStartingStreamRef.current = true
          try {
            await startUsbStreaming(port)
            appendUsbStreamLog('▶️ Visualisation des logs reprise', 'dashboard')
          } finally {
            isStartingStreamRef.current = false
          }
        }
      } else {
        // Si arrêté (ne devrait pas arriver normalement), démarrer
        if (isConnected && port && !isStartingStreamRef.current) {
          isStartingStreamRef.current = true
          try {
            await startUsbStreaming(port)
          } finally {
            isStartingStreamRef.current = false
          }
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

  // Les fonctions handleArchiveDevice et handlePermanentDeleteDevice sont maintenant fournies par les hooks useEntityArchive et useEntityPermanentDelete
  
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
        refetchDevicesRef.current()
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
  }, [fetchWithAuth, API_URL, appendUsbStreamLog])
  
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
      refetchDevicesRef.current()
    } catch (err) {
      logger.error('Erreur assignation patient:', err)
      appendUsbStreamLog(`❌ Erreur assignation patient: ${err.message || err}`, 'dashboard')
    } finally {
      setAssigningPatient(false)
    }
  }, [fetchWithAuth, API_URL, deviceToAssign, allPatients, appendUsbStreamLog])
  
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
        await refetchDevicesRef.current()
      }, 500)
      createTimeoutWithCleanup(() => setSuccessMessage(null), 5000)
    } catch (err) {
      logger.error('Erreur désassignation patient:', err)
      appendUsbStreamLog(`❌ Erreur désassignation: ${err.message || err}`, 'dashboard')
    } finally {
      setUnassigningPatient(null)
    }
  }, [fetchWithAuth, API_URL, allPatients, appendUsbStreamLog, invalidateCache, createTimeoutWithCleanup, setSuccessMessage])
  
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
              La configuration du dispositif sera réinitialisée aux paramètres d&apos;origine.
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
          logger.debug('[UsbStreamingTab] Fermeture modal dispositif')
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
          refetchDevicesRef.current()
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
              Cliquez sur l&apos;icône 📊 dans les actions pour voir l&apos;historique complet (GPS, débit, batterie, RSSI).
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
          {/* Fonctions helpers pour fusionner les données (définies une seule fois) */}
          {(() => {
            // Utiliser la fonction normalizeId définie avec useCallback (ligne 145)
            // Note: normalizeId est accessible depuis le scope du composant
            // Fusionner valeurs : USB en priorité, puis DB
            const getValue = (usbVal, dbVal) => usbVal ?? dbVal
            // Alias pour normalizeId pour s'assurer qu'elle est accessible (même si elle est déjà dans le scope)
            const normalizeIdLocal = normalizeId
            
            return (
              <div className="overflow-x-auto">
                {devicesLoading ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    Chargement des dispositifs...
                  </div>
                ) : devicesToDisplay.length === 0 && !devicesLoading ? (
                  <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <p className="text-sm">Aucun dispositif trouvé</p>
                  </div>
                ) : (
                  <>
                    <table className="w-full border-collapse bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Nom</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">SIM ICCID</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Firmware</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Numéro SIM</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">État SIM</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Opérateur/APN</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Itinérance</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Code PIN SIM</th>
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">État Réseau</th>
                      <th className="px-3 py-1.5 text-center text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">En base</th>
                      <th className="px-3 py-1.5 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allDevices.length === 0 && !usbDevice && (
                      <tr className="table-row hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td colSpan="11" className="table-cell px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                          <div className="flex flex-col items-center gap-3">
                            <span className="text-4xl">🔌</span>
                            <p className="text-sm font-medium">Aucun dispositif enregistré</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              Connectez un dispositif USB pour le configurer
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                    {showArchived && allDevices.filter(d => isArchived(d)).length === 0 && (
                      <tr className="table-row hover:bg-gray-50 dark:hover:bg-gray-800">
                        <td colSpan="11" className="table-cell px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                          <div className="flex flex-col items-center gap-3">
                            <span className="text-4xl">🗄️</span>
                            <p className="text-sm font-medium">Aucun dispositif archivé</p>
                          </div>
                        </td>
                      </tr>
                    )}
                    {devicesToDisplay.length > 0 && (
                      devicesToDisplay.map((device) => {
                  const deviceIsArchived = isArchived(device)
                  const deviceDbData = device
                  const deviceConfig = deviceDbData?.config || {}
                  
                  // Vérifier si le dispositif est enregistré en base (a un ID de base de données)
                  // Un vrai ID de base de données est un nombre ou une string qui ne commence pas par "usb" (usb_info_, usb_temp_, usb-, etc.)
                  const hasRealId = device?.id && 
                    (typeof device.id === 'number' || 
                     (typeof device.id === 'string' && !device.id.startsWith('usb')))
                  // Un dispositif est non enregistré s'il n'a pas de vrai ID, ou s'il est marqué comme virtuel/temporaire
                  const isNotRegistered = !hasRealId || device?.isVirtual
                  
                  // Normaliser les identifiants pour comparaison
                  // Utiliser normalizeIdLocal (alias de normalizeId) pour éviter les warnings ESLint
                  const deviceIccid = normalizeIdLocal(device.sim_iccid)
                  const normalizedDeviceSerial = normalizeIdLocal(device.device_serial)
                  
                  // Vérifier si ce dispositif est connecté en USB (enregistré ou virtuel)
                  const isDeviceUsbConnected = isConnected && (
                    (usbDeviceInfo?.sim_iccid && normalizeIdLocal(usbDeviceInfo.sim_iccid) === deviceIccid) ||
                    (usbDeviceInfo?.device_serial && normalizeIdLocal(usbDeviceInfo.device_serial) === normalizedDeviceSerial) ||
                    isUsbDeviceRegistered() && usbDevice.id === device.id
                  )
                  
                  // Vérifier si ce dispositif est un dispositif USB virtuel (non enregistré)
                  const isDeviceUsbVirtual = usbDevice && !isUsbDeviceRegistered() && (
                    (usbDevice.sim_iccid && normalizeIdLocal(usbDevice.sim_iccid) === deviceIccid) ||
                    (usbDevice.device_serial && normalizeIdLocal(usbDevice.device_serial) === normalizedDeviceSerial)
                  )
                  
                  // Source de données USB : TOUJOURS utiliser usbDeviceInfo en priorité si disponible
                  // car c'est là que sont stockées toutes les informations parsées depuis les logs
                  // (sim_phone_number, sim_status, operator, apn, network_connected, etc.)
                  // Vérifier si ce dispositif correspond au dispositif USB connecté
                  let usbInfo = null
                  if (isConnected && usbDeviceInfo) {
                    // Vérifier si ce dispositif correspond au dispositif USB connecté
                    const usbInfoIccid = normalizeIdLocal(usbDeviceInfo.sim_iccid)
                    const usbInfoSerial = normalizeIdLocal(usbDeviceInfo.device_serial)
                    
                    // Correspondance par ICCID (priorité 1)
                    const matchesByIccid = usbInfoIccid && deviceIccid && usbInfoIccid === deviceIccid
                    // Correspondance par Serial (priorité 2)
                    const matchesBySerial = usbInfoSerial && normalizedDeviceSerial && usbInfoSerial === normalizedDeviceSerial
                    
                    if (matchesByIccid || matchesBySerial || isDeviceUsbConnected || isDeviceUsbVirtual) {
                      usbInfo = usbDeviceInfo
                      logger.debug('[TableRow] usbDeviceInfo utilisé pour:', {
                        deviceName: device.device_name,
                        matchesByIccid,
                        matchesBySerial,
                        deviceIccid: deviceIccid?.slice(-10),
                        usbInfoIccid: usbInfoIccid?.slice(-10)
                      })
                    }
                  }
                  // Si pas de correspondance avec usbDeviceInfo, utiliser usbDevice si c'est un dispositif virtuel
                  if (!usbInfo && isDeviceUsbVirtual && usbDevice) {
                    usbInfo = usbDevice
                    logger.debug('[TableRow] usbDevice utilisé (virtuel):', device.device_name)
                  }
                  const usbConfig = usbInfo?.config || {}
                  
                  // Debug : vérifier qu'on a bien les données USB
                  if (!usbInfo && isConnected && (deviceIccid || normalizedDeviceSerial)) {
                    logger.debug('[TableRow] ⚠️ Pas de usbInfo trouvé pour:', {
                      deviceName: device.device_name,
                      deviceIccid: deviceIccid?.slice(-10),
                      deviceSerial: normalizedDeviceSerial,
                      hasUsbDeviceInfo: !!usbDeviceInfo,
                      usbDeviceInfoIccid: usbDeviceInfo?.sim_iccid?.slice(-10),
                      usbDeviceInfoSerial: usbDeviceInfo?.device_serial
                    })
                  }
                  
                  // Fusionner toutes les données : USB en priorité, puis DB
                  const simIccid = getValue(usbInfo?.sim_iccid, deviceDbData?.sim_iccid)
                  const deviceSerial = getValue(usbInfo?.device_serial, deviceDbData?.device_serial)
                  
                  // Générer un nom intelligent : utiliser le nom USB si disponible, sinon générer depuis les identifiants
                  let deviceName = deviceDbData?.device_name || usbInfo?.device_name
                  if (!deviceName && (simIccid || deviceSerial)) {
                    // Générer un nom depuis les identifiants disponibles
                    if (simIccid) {
                      deviceName = `USB-${simIccid.slice(-4)}`
                    } else if (deviceSerial) {
                      deviceName = `USB-${deviceSerial.slice(-4)}`
                    }
                  }
                  
                  const firmwareVersion = getValue(usbInfo?.firmware_version, deviceDbData?.firmware_version)
                  const simPhoneNumber = getValue(usbInfo?.sim_phone_number, deviceDbData?.sim_phone_number)
                  const simStatus = getValue(usbInfo?.sim_status, deviceDbData?.sim_status)
                  
                  // Config : USB si valeur présente, sinon DB
                  const operator = (usbConfig.operator && usbConfig.operator !== '') ? usbConfig.operator : (deviceConfig.operator || '')
                  const apn = (usbConfig.apn && usbConfig.apn !== '') ? usbConfig.apn : (deviceConfig.apn || '')
                  const roaming = getValue(usbConfig.roaming_enabled, deviceConfig.roaming_enabled)
                  const simPin = (usbConfig.sim_pin && usbConfig.sim_pin !== '') ? usbConfig.sim_pin : (deviceConfig.sim_pin || '')
                  
                  // État réseau : USB en priorité, puis DB
                  const networkConnected = getValue(usbInfo?.network_connected, deviceDbData?.network_connected)
                  const gprsConnected = getValue(usbInfo?.gprs_connected, deviceDbData?.gprs_connected)
                  const modemReady = getValue(usbInfo?.modem_ready, deviceDbData?.modem_ready)
                  
                  // Fonction pour convertir le code MCC/MNC en nom d'opérateur
                  const getOperatorName = (operatorCode) => {
                    if (!operatorCode) return null
                    const codeStr = String(operatorCode)
                    // Codes MCC/MNC pour la France (208 = MCC France)
                    if (codeStr.includes('20801') || codeStr.includes('20802')) return 'Orange'
                    if (codeStr.includes('20810') || codeStr.includes('20811')) return 'SFR'
                    if (codeStr.includes('20815') || codeStr.includes('20816')) return 'Free'
                    if (codeStr.includes('20820')) return 'Bouygues'
                    // Si c'est déjà un nom d'opérateur (Orange, SFR, Free, Bouygues), le retourner tel quel
                    if (['Orange', 'SFR', 'Free', 'Bouygues'].includes(codeStr)) return codeStr
                    // Sinon, retourner null pour afficher autre chose
                    return null
                  }
                  
                  // Formater les affichages
                  const simStatusDisplay = !simStatus ? 'N/A' : 
                    simStatus === 'READY' ? '✅ Prête' :
                    simStatus === 'LOCKED' ? '🔒 Verrouillée' :
                    simStatus === 'ANTITHEFT_LOCKED' ? '🔐 Anti-vol' :
                    simStatus === 'ERROR' ? '❌ Erreur' :
                    simStatus === 'MODEM_NOT_READY' ? '⏳ Modem non prêt' : simStatus
                  
                  // Convertir le code opérateur en nom si c'est un code MCC/MNC
                  const operatorName = getOperatorName(operator)
                  const operatorDisplay = operatorName || (operator ? operator : (apn ? `APN: ${apn}` : '🔍 Auto'))
                  const roamingDisplay = roaming === true ? '✅ Activée' : 
                    roaming === false ? '❌ Désactivée' : 'N/A'
                  const simPinDisplay = simPin ? '🔐 ***' : 'N/A'
                  const networkStatus = networkConnected && gprsConnected ? '✅ Connecté (GPRS)' :
                    networkConnected ? '📡 Réseau OK' :
                    modemReady ? '⏳ En attente' : '❌ Non connecté'
                  
                  return (
                    <tr key={device.id || device.sim_iccid || device.device_serial || `usb-${Date.now()}`} className={`table-row hover:bg-gray-50 dark:hover:bg-gray-800 ${deviceIsArchived ? 'opacity-60' : ''}`}>
                {/* Nom */}
                <td className="table-cell px-3 py-1.5">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-semibold ${!deviceName ? 'text-gray-400 dark:text-gray-500' : 'text-orange-600 dark:text-orange-400'}`}>
                        {deviceName || 'N/A'}
                      </span>
                      {deviceIsArchived && (
                        <span className="ml-2 badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">🗄️ Archivé</span>
                      )}
                      {(isDeviceUsbConnected || isDeviceUsbVirtual) && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-green-500 text-white rounded animate-pulse">
                          <span className="w-1 h-1 bg-white rounded-full"></span>
                          LIVE
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                
                {/* SIM ICCID */}
                <td className="table-cell px-3 py-1.5 text-xs font-mono text-gray-700 dark:text-gray-300">
                  {simIccid || 'N/A'}
                </td>
                
                {/* Firmware */}
                <td className="table-cell px-3 py-1.5">
                  {(() => {
                    const canFlash = compiledFirmwares.length > 0
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          {deviceIsArchived ? (
                            <span className={`text-xs font-mono font-semibold ${!firmwareVersion ? 'text-gray-400 dark:text-gray-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                              {firmwareVersion || 'N/A'}
                            </span>
                          ) : canFlash ? (
                            <button
                              onClick={() => handleOpenFlashModal(device)}
                              className={`text-xs font-mono font-semibold hover:underline transition-colors ${!firmwareVersion ? 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300' : 'text-cyan-600 dark:text-cyan-400 hover:text-cyan-700 dark:hover:text-cyan-300 cursor-pointer'}`}
                              title="Cliquer pour flasher un firmware"
                            >
                              {firmwareVersion || 'N/A'}
                            </button>
                          ) : (
                            <span className={`text-xs font-mono font-semibold ${!firmwareVersion ? 'text-gray-400 dark:text-gray-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                              {firmwareVersion || 'N/A'}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })()}
                </td>
                
                {/* Numéro SIM */}
                <td className="table-cell px-3 py-1.5 text-xs font-mono text-gray-700 dark:text-gray-300">
                  {simPhoneNumber || 'N/A'}
                </td>
                
                {/* État SIM */}
                <td className="table-cell px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300">
                  {simStatusDisplay}
                </td>
                
                {/* Opérateur/APN */}
                <td className="table-cell px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300">
                  {operatorDisplay}
                </td>
                
                {/* Itinérance */}
                <td className="table-cell px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300">
                  {roamingDisplay}
                </td>
                
                {/* Code PIN SIM */}
                <td className="table-cell px-3 py-1.5 text-xs font-mono text-gray-700 dark:text-gray-300">
                  {simPinDisplay}
                </td>
                
                {/* État Réseau */}
                <td className="table-cell px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300">
                  {networkStatus}
                </td>
                
                {/* En base */}
                <td className="table-cell px-3 py-1.5 text-center">
                  {isNotRegistered ? (
                    <span className="badge badge-error text-xs">
                      ❌ Non
                    </span>
                  ) : (
                    <span className="badge badge-success text-xs">
                      ✅ Oui
                    </span>
                  )}
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
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            logger.debug('[UsbStreamingTab] Clic bouton modification dispositif')
                            logger.debug('[UsbStreamingTab] Device:', device)
                            setEditingDevice(device)
                            setShowDeviceModal(true)
                          }}
                          className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                          title="Modifier le dispositif (données et configuration)"
                          type="button"
                        >
                          <span className="text-lg">✏️</span>
                        </button>
                        {(() => {
                          const hasPatient = !!deviceDbData?.patient_id
                          // Utiliser isNotRegistered défini au début de la boucle map
                          
                          if (hasPatient) {
                            // Dispositif assigné : bouton désassigner
                            return (
                              <button
                                className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleOpenUnassignPatientModal(device)}
                                disabled={unassigningPatient || isNotRegistered}
                                title={isNotRegistered ? "Enregistrez d'abord le dispositif" : "Désassigner le patient du dispositif"}
                              >
                                <span className="text-lg">{unassigningPatient ? '⏳' : '🔓'}</span>
                              </button>
                            )
                          } else {
                            // Pas de patient : bouton assigner
                            return (
                              <button
                                className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                onClick={() => handleOpenAssignPatientModal(device)}
                                disabled={isNotRegistered || availablePatients.length === 0 || assigningPatient}
                                title={isNotRegistered ? "Enregistrez d'abord le dispositif" : (availablePatients.length === 0 ? "Aucun patient libre disponible" : "Assigner un patient au dispositif")}
                              >
                                <span className="text-lg">🔗</span>
                              </button>
                            )
                          }
                        })()}
                        <button
                          onClick={() => handleOpenFlashModal(device)}
                          disabled={compiledFirmwares.length === 0 || isNotRegistered}
                          className="p-2 hover:bg-primary-100 dark:hover:bg-primary-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={isNotRegistered ? "Enregistrez d'abord le dispositif" : (compiledFirmwares.length === 0 ? 'Aucun firmware compilé disponible. Compilez d\'abord un firmware dans l\'onglet "Upload INO".' : 'Flasher le firmware')}
                        >
                          <span className="text-lg">🚀</span>
                        </button>
                        <button
                          onClick={() => {
                            if (deviceDbData?.measurement_count && deviceDbData.measurement_count > 0) {
                              setDeviceForMeasurements(device)
                              setShowMeasurementsModal(true)
                            }
                          }}
                          disabled={isNotRegistered || !deviceDbData?.measurement_count || deviceDbData.measurement_count === 0}
                          className="p-2 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={isNotRegistered ? "Enregistrez d'abord le dispositif" : (deviceDbData?.measurement_count ? `Voir l'historique des mesures (${deviceDbData.measurement_count} mesure${deviceDbData.measurement_count > 1 ? 's' : ''})` : 'Aucune mesure enregistrée')}
                        >
                          <span className="text-lg">📊</span>
                        </button>
                        {hasPermission('devices.edit') && (
                          <>
                            {/* Administrateurs : Archive + Suppression définitive */}
                            {user?.role_name === 'admin' ? (
                              <>
                                <button
                                  onClick={() => handleArchiveDevice(device)}
                                  disabled={isNotRegistered || archivingDevice === device.id || deletingDevice === device.id}
                                  className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={isNotRegistered ? "Enregistrez d'abord le dispositif" : "Archiver le dispositif"}
                                >
                                  <span className="text-lg">{archivingDevice === device.id ? '⏳' : '🗄️'}</span>
                                </button>
                                <button
                                  onClick={() => handlePermanentDeleteDevice(device)}
                                  disabled={isNotRegistered || archivingDevice === device.id || deletingDevice === device.id}
                                  className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title={isNotRegistered ? "Enregistrez d'abord le dispositif" : "Supprimer définitivement le dispositif"}
                                >
                                  <span className="text-lg">{deletingDevice === device.id ? '⏳' : '🗑️'}</span>
                                </button>
                              </>
                            ) : (
                              /* Non-administrateurs : Archive uniquement (pas de suppression définitive) */
                              <button
                                onClick={() => handleArchiveDevice(device)}
                                disabled={isNotRegistered || archivingDevice === device.id || deletingDevice === device.id}
                                className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={isNotRegistered ? "Enregistrez d'abord le dispositif" : "Archiver le dispositif"}
                              >
                                <span className="text-lg">{archivingDevice === device.id ? '⏳' : '🗄️'}</span>
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
            )
          })()}
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
                <span className={`badge text-xs ${
                  isConnected 
                    ? 'badge-success' 
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
              {/* Bouton pour sélectionner un port USB si non connecté */}
              {!isConnected && isSupported && (
                <button
                  onClick={async () => {
                    try {
                      appendUsbStreamLog('🔍 Sélection du port USB...', 'dashboard')
                      const selectedPort = await requestPort()
                      if (selectedPort) {
                        // Afficher les informations du port sélectionné
                        const portInfo = selectedPort.getInfo?.()
                        const deviceLabel = getUsbDeviceLabel(portInfo)
                        const portPath = portInfo?.path || 'Port inconnu'
                        const portLabel = deviceLabel ? `${deviceLabel} (${portPath})` : portPath
                        appendUsbStreamLog(`✅ Port sélectionné: ${portLabel}`, 'dashboard')
                        logger.log(`[USB] Port sélectionné: ${portLabel}`, portInfo)
                        
                        appendUsbStreamLog('🔌 Connexion au port en cours...', 'dashboard')
                        const connected = await connect(selectedPort, 115200)
                        if (connected) {
                          appendUsbStreamLog(`✅ Connexion USB établie sur ${portLabel} !`, 'dashboard')
                          logger.log(`[USB] Connexion établie sur ${portLabel}`)
                          
                          // Démarrer automatiquement le streaming après connexion
                          // Le useEffect gère déjà le démarrage automatique, donc on ne démarre que si pas déjà en cours
                          const streamTimeoutId = setTimeout(async () => {
                            // Vérifier si le streaming n'est pas déjà démarré par le useEffect
                            if (usbStreamStatus !== 'idle' || isStartingStreamRef.current) {
                              logger.debug('[USB] Streaming déjà démarré ou en cours, pas de démarrage manuel')
                              timeoutRefs.current = timeoutRefs.current.filter(id => id !== streamTimeoutId)
                              return
                            }
                            
                            try {
                              isStartingStreamRef.current = true
                              logger.log('[USB] Démarrage streaming après connexion manuelle')
                              await startUsbStreaming(selectedPort)
                            } catch (streamErr) {
                              logger.error('❌ Erreur démarrage streaming:', streamErr)
                              appendUsbStreamLog(`❌ Erreur démarrage streaming: ${streamErr.message || streamErr}`, 'dashboard')
                            } finally {
                              isStartingStreamRef.current = false
                              // Nettoyer le timeout de la liste
                              timeoutRefs.current = timeoutRefs.current.filter(id => id !== streamTimeoutId)
                            }
                          }, 500)
                          timeoutRefs.current.push(streamTimeoutId)
                        } else {
                          appendUsbStreamLog(`❌ Échec de la connexion au port ${portLabel}`, 'dashboard')
                          logger.error(`[USB] Échec connexion au port ${portLabel}`)
                        }
                      } else {
                        // requestPort() a retourné null sans lever d'erreur
                        // Cela peut arriver si l'API n'est pas supportée ou si l'utilisateur a annulé silencieusement
                        appendUsbStreamLog('ℹ️ Aucun port sélectionné. Vérifiez que votre navigateur supporte l\'API Web Serial (Chrome/Edge) et qu\'un périphérique USB est connecté.', 'dashboard')
                        logger.warn('[USB] requestPort() a retourné null sans erreur')
                      }
                    } catch (err) {
                      if (err.name === 'NotFoundError') {
                        appendUsbStreamLog('ℹ️ Aucun port sélectionné (utilisateur a annulé)', 'dashboard')
                      } else {
                        logger.error('❌ Erreur sélection port:', err)
                        appendUsbStreamLog(`❌ Erreur: ${err.message || err}`, 'dashboard')
                      }
                    }
                  }}
                  className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-md hover:shadow-lg"
                  title="Autoriser COM3 (une seule fois nécessaire) - Après autorisation, la connexion sera automatique"
                >
                  🔌 Autoriser COM3 (automatique après)
                </button>
              )}
              <button
                onClick={async () => {
                  if (usbStreamStatus === 'running') {
                    pauseUsbStreaming()
                    logger.log('⏸️ Logs en pause')
                  } else if (usbStreamStatus === 'paused' && !isStartingStreamRef.current) {
                    isStartingStreamRef.current = true
                    try {
                      await startUsbStreaming(port)
                      logger.log('▶️ Logs reprennent')
                    } finally {
                      isStartingStreamRef.current = false
                    }
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
                {usbStreamStatus === 'paused' ? (
                  <>
                    <span>▶️</span>
                    <span>Reprendre</span>
                  </>
                ) : (
                  <>
                    <span>⏸️</span>
                    <span>Pause</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  // Extraire le texte de chaque log (propriété 'line') et les joindre
                  const allLogsText = [...usbStreamLogs, ...remoteLogs]
                    .map(log => log.line || String(log))
                    .join('\n')
                  navigator.clipboard.writeText(allLogsText)
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
                {formattedLogs.map((log) => (
                  <div key={log.id} className="whitespace-pre-wrap">
                    <span className="text-gray-500 pr-3">{new Date(log.timestamp).toLocaleTimeString('fr-FR')}</span>
                    {log.isRemote && <span className="text-purple-400 text-xs mr-2">📡</span>}
                    <span className="text-gray-400 dark:text-gray-500 font-semibold mr-2">
                      {log.provenance}
                    </span>
                    <span className={log.colorClass}>
                      {log.cleanLine}
                    </span>
                  </div>
                ))}
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
                    // Effacer tous les logs (locaux et distants)
                    clearUsbStreamLogs()
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


