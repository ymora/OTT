'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useUsb } from '@/contexts/UsbContext'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData, useEntityRestore, useEntityArchive, useEntityPermanentDelete, useSmartDeviceRefresh } from '@/hooks'
import { isArchived } from '@/lib/utils'
import { getUsbDeviceLabel } from '@/lib/usbDevices'
import logger from '@/lib/logger'
import Modal from '@/components/Modal'
import ConfirmModal from '@/components/ConfirmModal'
import FlashModal from '@/components/FlashModal'
import DeviceModal from '@/components/DeviceModal'
import DeviceMeasurementsModal from '@/components/DeviceMeasurementsModal'
import SuccessMessage from '@/components/SuccessMessage'
// Nouveaux composants et hooks refactorisés
import UsbConsole from '@/components/usb/UsbConsole'
import { useDeviceRegistration } from '@/components/usb/hooks/useDeviceRegistration'
import { useUsbStreaming } from '@/components/usb/hooks/useUsbStreaming'
import { useUsbCallbacks } from '@/components/usb/hooks/useUsbCallbacks'

export default function DebugTab() {
  const usbContext = useUsb()
  
  // Références pour gérer les timeouts avec cleanup
  const timeoutRefs = useRef([])
  const isMountedRef = useRef(true)
  // Flag pour éviter le double démarrage du streaming
  const isStartingStreamRef = useRef(false)
  
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
    clearUsbStreamLogs,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback,
    checkOtaSync
  } = usbContext
  
  const { fetchWithAuth, API_URL, user } = useAuth()
  
  // Helper pour vérifier les permissions
  const hasPermission = (permission) => {
    if (!permission) return true
    if (user?.role_name === 'admin') return true
    return user?.permissions?.includes(permission) || false
  }
  
  // Helper pour normaliser les identifiants (fonction pure, mémorisée pour éviter les recréations)
  // IMPORTANT: Normalisation robuste pour éviter les doublons (espaces, casse, caractères spéciaux)
  const normalizeId = useCallback((val) => {
    if (!val) return ''
    return String(val)
      .trim()
      .replace(/\s+/g, '') // Supprimer tous les espaces
      .toLowerCase() // Normaliser la casse
      .replace(/[^a-z0-9]/g, '') // Supprimer les caractères spéciaux (garder seulement alphanumérique)
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
  
  // Dédupliquer les dispositifs : garder uniquement le plus récent par ICCID ou Serial
  // IMPORTANT: Cette logique garantit qu'il n'y a JAMAIS de doublons dans le tableau
  // Utilise une Map avec clé normalisée (ICCID prioritaire, puis Serial) pour une déduplication robuste
  const allDevices = useMemo(() => {
    if (!allDevicesFromApi || allDevicesFromApi.length === 0) return []
    
    const deviceMap = new Map() // Clé: normalized ICCID ou Serial, Valeur: device
    const seenIds = new Set() // Pour éviter les doublons par ID de base de données
    
    allDevicesFromApi.forEach(device => {
      // Ignorer les devices sans ID (ne devraient pas arriver, mais sécurité)
      if (!device.id) return
      
      const dbId = String(device.id)
      
      // Éviter les doublons par ID de base de données (un même ID ne doit apparaître qu'une fois)
      if (seenIds.has(dbId)) {
        return // Ignorer ce doublon par ID
      }
      seenIds.add(dbId)
      
      // Normaliser les identifiants
      const iccid = normalizeId(device.sim_iccid)
      const serial = normalizeId(device.device_serial)
      
      // Créer une clé unique : ICCID prioritaire, puis Serial
      // Si ni ICCID ni Serial, utiliser l'ID comme clé de secours
      const key = iccid || serial || `id-${dbId}`
      
      if (!key) return // Ignorer les devices sans identifiant du tout
      
      // Vérifier si on a déjà un device avec cette clé (ICCID ou Serial)
      const existing = deviceMap.get(key)
      if (existing) {
        // Conflit détecté : deux devices avec le même ICCID/Serial mais IDs différents
        // Garder le plus récent (priorité : last_seen > updated_at > created_at)
        const existingDate = new Date(existing.last_seen || existing.updated_at || existing.created_at || 0).getTime()
        const currentDate = new Date(device.last_seen || device.updated_at || device.created_at || 0).getTime()
        
        if (currentDate > existingDate) {
          // Le nouveau est plus récent : remplacer l'ancien
          // Retirer l'ancien de seenIds pour permettre son remplacement
          if (existing.id) {
            seenIds.delete(String(existing.id))
          }
          deviceMap.set(key, device)
        }
        // Sinon, garder l'existant (ne rien faire)
      } else {
        // Nouveau device, l'ajouter
        deviceMap.set(key, device)
      }
    })
    
    // Convertir la Map en tableau
    return Array.from(deviceMap.values())
  }, [allDevicesFromApi, normalizeId])
  
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
  
  // ========== HOOKS REFACTORISÉS ==========
  
  // Hook pour le streaming de logs (local et distant)
  const { remoteLogs, isStreamingRemote } = useUsbStreaming({
    user,
    isConnected,
    usbDevice,
    usbStreamLogs,
    fetchWithAuth,
    API_URL
  })
  
  // AUTO-SÉLECTION du device avec badge ● LIVE pour admin distant
  useEffect(() => {
    if (user?.role_name !== 'admin' || isConnected || usbDevice || !allDevices || allDevices.length === 0) {
      return
    }
    
    const checkLiveDevices = async () => {
      try {
        const thirtySecondsAgo = Date.now() - 30000
        const deviceChecks = allDevices.map(async (device) => {
          const deviceId = device.sim_iccid || device.device_serial || device.id
          try {
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
              if (lastLogTime > thirtySecondsAgo) {
                return { device, isLive: true }
              }
            }
          } catch (err) {
            logger.debug(`Erreur vérification logs pour device ${deviceId}:`, err)
          }
          return { device, isLive: false }
        })
        const results = await Promise.all(deviceChecks)
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
  
  // Hook pour configurer les callbacks USB
  useUsbCallbacks({
    fetchWithAuth,
    API_URL,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback,
    appendUsbStreamLog,
    refetchDevicesRef,
    notifyDevicesUpdated,
    createTimeoutWithCleanup
  })
  
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
  
  // Hook pour la synchronisation du dispositif USB avec la base
  const allDevicesRef = useRef([])
  useEffect(() => {
    allDevicesRef.current = allDevices
  }, [allDevices])
  
  useDeviceRegistration({
    isConnected,
    usbDeviceInfo,
    usbDevice,
    setUsbDevice,
    allDevices: allDevicesRef.current,
    isUsbDeviceRegistered,
    normalizeId,
    invalidateCache,
    refetchDevicesRef
  })
  
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

        {/* Console de logs USB - Composant refactorisé */}
        <UsbConsole
          isConnected={isConnected}
          isSupported={isSupported}
          usbStreamStatus={usbStreamStatus}
          usbStreamLogs={usbStreamLogs}
          remoteLogs={remoteLogs}
          isStreamingRemote={isStreamingRemote}
          port={port}
          requestPort={requestPort}
          connect={connect}
          startUsbStreaming={startUsbStreaming}
          pauseUsbStreaming={pauseUsbStreaming}
          appendUsbStreamLog={appendUsbStreamLog}
          clearUsbStreamLogs={clearUsbStreamLogs}
          isStartingStreamRef={isStartingStreamRef}
          timeoutRefs={timeoutRefs}
          createTimeoutWithCleanup={createTimeoutWithCleanup}
        />

      </div>
    </div>
  )
}


