'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useUsb } from '@/contexts/UsbContext'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import { createUpdateConfigCommand, createUpdateCalibrationCommand } from '@/lib/deviceCommands'
import { getUsbDeviceLabel } from '@/lib/usbDevices'
import logger from '@/lib/logger'
import Modal from '@/components/Modal'

export default function DebugTab() {
  const {
    usbConnectedDevice,
    usbVirtualDevice,
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
    appendUsbStreamLog
  } = useUsb()
  
  const { fetchWithAuth, API_URL, user } = useAuth()
  
  // Charger tous les dispositifs pour le tableau
  const { data: devicesData, loading: devicesLoading, refetch: refetchDevices } = useApiData(
    ['/api.php/devices'],
    { requiresAuth: true, autoLoad: !!user }
  )
  const allDevices = devicesData?.devices?.devices || []
  
  // États pour la suppression
  const [deviceToDelete, setDeviceToDelete] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  
  // États pour le formulaire de création
  const [showCreateDeviceModal, setShowCreateDeviceModal] = useState(false)
  const [creatingDevice, setCreatingDevice] = useState(false)
  const [deviceFormData, setDeviceFormData] = useState({
    sim_iccid: '',
    device_serial: '',
    device_name: '',
    status: 'inactive',
    patient_id: null
  })
  const [deviceFormError, setDeviceFormError] = useState(null)
  
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
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    
    if (diffSec < 60) return `${diffSec}s`
    if (diffMin < 60) return `${diffMin}min`
    if (diffHour < 24) return `${diffHour}h`
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
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
          logger.log('[DebugTab] Démarrage automatique du streaming...')
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
      await new Promise(resolve => setTimeout(resolve, 100))
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
    <tr className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-4 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-lg">{icon}</span>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        </div>
      </td>
      <td className="px-4 py-1.5">
        <span className={`text-sm font-semibold ${colorClass || 'text-gray-600 dark:text-gray-400'}`}>
          {value}
        </span>
      </td>
    </tr>
  )

  // Fonction pour supprimer un dispositif
  const handleDeleteDevice = useCallback(async (device, skipConfirm = false) => {
    // Si le dispositif est assigné et qu'on ne skip pas la confirmation, afficher la modal
    if (device.patient_id && !skipConfirm) {
      setDeviceToDelete(device)
      setShowDeleteModal(true)
      return
    }
    
    // Suppression directe si non assigné ou confirmation validée
    setDeleting(true)
    try {
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      
      if (response.success) {
        logger.log(`✅ Dispositif "${device.device_name || device.sim_iccid}" supprimé avec succès`)
        appendUsbStreamLog(`✅ Dispositif "${device.device_name || device.sim_iccid}" supprimé`, 'dashboard')
        // Recharger la liste des dispositifs
        refetchDevices()
        setShowDeleteModal(false)
        setDeviceToDelete(null)
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
  }, [fetchWithAuth, API_URL, refetchDevices, appendUsbStreamLog])
  
  // Confirmer la suppression depuis la modal
  const confirmDelete = useCallback(() => {
    if (deviceToDelete) {
      handleDeleteDevice(deviceToDelete, true)
    }
  }, [deviceToDelete, handleDeleteDevice])
  
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
  const handleCreateDevice = useCallback(async () => {
    setCreatingDevice(true)
    setDeviceFormError(null)
    try {
      const url = `${API_URL}/api.php/devices`
      const response = await fetchWithAuth(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceFormData)
      }, { requiresAuth: true })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
      }
      
      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Erreur API')
      }
      
      logger.log(`✅ Dispositif créé: ${data.device?.device_name || data.device?.sim_iccid}`)
      appendUsbStreamLog(`✅ Dispositif créé: ${data.device?.device_name || data.device?.sim_iccid}`, 'dashboard')
      setShowCreateDeviceModal(false)
      setDeviceFormData({
        sim_iccid: '',
        device_serial: '',
        device_name: '',
        status: 'inactive',
        patient_id: null
      })
      refetchDevices()
    } catch (err) {
      logger.error('Erreur création dispositif:', err)
      setDeviceFormError(err.message || 'Erreur lors de la création du dispositif')
      appendUsbStreamLog(`❌ Erreur création dispositif: ${err.message || err}`, 'dashboard')
    } finally {
      setCreatingDevice(false)
    }
  }, [fetchWithAuth, API_URL, deviceFormData, appendUsbStreamLog, refetchDevices])

  return (
    <div className="space-y-6">
      {/* Modal de confirmation de suppression */}
      {/* Modal de création de dispositif */}
      <Modal
        isOpen={showCreateDeviceModal}
        onClose={() => {
          setShowCreateDeviceModal(false)
          setDeviceFormData({
            sim_iccid: '',
            device_serial: '',
            device_name: '',
            status: 'inactive',
            patient_id: null
          })
          setDeviceFormError(null)
        }}
        title="➕ Créer un nouveau dispositif"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-4">
          {deviceFormError && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-800 dark:text-red-300">{deviceFormError}</p>
            </div>
          )}
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nom du dispositif *
              </label>
              <input
                type="text"
                value={deviceFormData.device_name}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, device_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Ex: Dispositif OTT-001"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                SIM ICCID
              </label>
              <input
                type="text"
                value={deviceFormData.sim_iccid}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, sim_iccid: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Ex: 89314404000012345678"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Minimum 10 caractères si renseigné
              </p>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Numéro de série
              </label>
              <input
                type="text"
                value={deviceFormData.device_serial}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, device_serial: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Ex: ESP32-001"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Statut
              </label>
              <select
                value={deviceFormData.status}
                onChange={(e) => setDeviceFormData({ ...deviceFormData, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="inactive">Inactif</option>
                <option value="active">Actif</option>
                <option value="maintenance">Maintenance</option>
              </select>
            </div>
          </div>
          
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => {
                setShowCreateDeviceModal(false)
                setDeviceFormData({
                  sim_iccid: '',
                  device_serial: '',
                  device_name: '',
                  status: 'inactive',
                  patient_id: null
                })
                setDeviceFormError(null)
              }}
              className="btn-secondary"
              disabled={creatingDevice}
            >
              Annuler
            </button>
            <button
              onClick={handleCreateDevice}
              disabled={creatingDevice || !deviceFormData.device_name.trim()}
              className="btn-primary"
            >
              {creatingDevice ? '⏳ Création...' : '✅ Créer'}
            </button>
          </div>
        </div>
      </Modal>
      
      {/* Modal de confirmation de suppression */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setDeviceToDelete(null)
        }}
        title="Confirmer la suppression"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-gray-700 dark:text-gray-300">
            Êtes-vous sûr de vouloir supprimer le dispositif <strong>{deviceToDelete?.device_name || deviceToDelete?.sim_iccid}</strong> ?
          </p>
          
          {deviceToDelete?.patient_id && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                ⚠️ <strong>Attention :</strong> Ce dispositif est assigné au patient <strong>{deviceToDelete?.first_name} {deviceToDelete?.last_name}</strong>.
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-2">
                Le dispositif sera désassigné automatiquement avant suppression.
              </p>
            </div>
          )}
          
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => {
                setShowDeleteModal(false)
                setDeviceToDelete(null)
              }}
              disabled={deleting}
              className="px-4 py-2 text-sm bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {deleting ? '⏳ Suppression...' : '🗑️ Supprimer'}
            </button>
          </div>
        </div>
      </Modal>

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
          {dataSource && (usbDeviceInfo || dbDeviceData) && (
            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Source des données:</span>
                <span className={`px-2 py-0.5 rounded font-medium ${
                  dataSource === 'usb' 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                    : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                }`}>
                  {dataSource === 'usb' ? '🔌 USB (temps réel)' : '📡 Base de données'}
                </span>
                {dataSource === 'usb' && usbStreamLastUpdate && (
                  <span className="text-gray-500 dark:text-gray-400 ml-auto">
                    Dernière mise à jour: {Math.floor((Date.now() - usbStreamLastUpdate) / 1000)}s
                  </span>
                )}
              </div>
            </div>
          )}
          
        </div>

        {/* Tableau des données - Affiche tous les dispositifs - TOUJOURS VISIBLE */}
        <div className="mb-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                📊 Tableau des Dispositifs
                {!devicesLoading && allDevices.length === 0 && (
                  <span className="ml-3 text-base font-normal text-gray-500 dark:text-gray-400">
                    (Aucun dispositif trouvé dans la base de données)
                  </span>
                )}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Tous les dispositifs de la base de données avec leurs données en temps réel (USB) ou depuis la base de données
              </p>
            </div>
            <button
              onClick={handleCreateTestDevices}
              disabled={creatingTestDevices}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              title="Créer des dispositifs fictifs pour les tests"
            >
              {creatingTestDevices ? '⏳ Création...' : '➕ Créer dispositifs fictifs'}
            </button>
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
                      <th className="px-3 py-1.5 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">État</th>
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
                    {allDevices.length === 0 ? (
                      <tr>
                        <td colSpan="12" className="px-3 py-8 text-center text-gray-500 dark:text-gray-400">
                          <div className="flex flex-col items-center gap-3">
                            <p className="text-sm">Aucun dispositif dans la base de données</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">
                              Utilisez le bouton "➕ Créer dispositifs fictifs" ci-dessus pour créer des dispositifs de test
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      allDevices.map((device) => {
                  // Vérifier si ce dispositif est connecté en USB
                  const isDeviceUsbConnected = isConnected && (
                    usbDeviceInfo?.sim_iccid === device.sim_iccid ||
                    usbDeviceInfo?.device_serial === device.device_serial
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
                    <tr key={device.id} className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                {/* Streaming - Cliquable pour pause/reprise (uniquement pour le dispositif connecté) */}
                <td 
                  className={`px-3 py-1.5 ${isDeviceUsbConnected ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors' : ''} ${(isDisabled || isToggling) && isDeviceUsbConnected ? 'cursor-not-allowed opacity-50' : ''}`}
                  onClick={isDeviceUsbConnected && !isDisabled && !isToggling ? handleToggleStreaming : undefined}
                  title={isDeviceUsbConnected ? (isDisabled ? 'Non disponible' : isToggling ? 'En cours...' : isStreaming ? 'Cliquer pour mettre en pause' : isPaused ? 'Cliquer pour reprendre' : 'Cliquer pour démarrer') : 'Non connecté'}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-base">
                      {isDeviceUsbConnected ? (isToggling ? '⏳' : isStreaming ? '▶️' : isPaused ? '⏸️' : '⏹️') : '—'}
                    </span>
                    <span className={`text-xs font-semibold ${isDeviceUsbConnected ? (isToggling ? 'text-gray-400 dark:text-gray-500' : isStreaming ? 'text-blue-600 dark:text-blue-400' : isPaused ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-400 dark:text-gray-500') : 'text-gray-400 dark:text-gray-500'}`}>
                      {isDeviceUsbConnected ? (isToggling ? 'Chargement...' : isStreaming ? 'En cours' : isPaused ? 'En pause' : 'Arrêté') : '—'}
                    </span>
                  </div>
                </td>
                
                {/* Identifiant */}
                <td className="px-3 py-1.5">
                  {(() => {
                    const deviceName = deviceUsbInfo?.device_name || deviceDbData?.device_name
                    const identifier = deviceUsbInfo?.sim_iccid || deviceUsbInfo?.device_serial || deviceDbData?.sim_iccid || deviceDbData?.device_serial
                    const source = deviceUsbInfo?.device_name ? 'usb' : (deviceDbData?.device_name ? 'database' : null)
                    const timestamp = deviceUsbInfo?.last_seen || deviceDbData?.last_seen
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${!deviceName ? 'text-gray-400 dark:text-gray-500' : 'text-orange-600 dark:text-orange-400'}`}>
                            {deviceName || 'N/A'}
                          </span>
                          {deviceName && source && (
                            <span className="text-[10px] opacity-60" title={source === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {source === 'usb' ? '🔌' : '💾'}
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
                <td className="px-3 py-1.5">
                  {(() => {
                    const patientName = deviceDbData?.first_name && deviceDbData?.last_name 
                      ? `${deviceDbData.first_name} ${deviceDbData.last_name}` 
                      : null
                    const source = patientName ? 'database' : null
                    return (
                      <div className="flex items-center gap-1">
                        {patientName ? (
                          <span className="badge badge-success text-xs">{patientName}</span>
                        ) : (
                          <span className="badge bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 text-xs">Non assigné</span>
                        )}
                        {source && (
                          <span className="text-[10px] opacity-60" title="Source: Base de données">
                            💾
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Firmware - USB en priorité, puis DB */}
                <td className="px-3 py-1.5">
                  {(() => {
                    const firmwareVersion = deviceUsbMeasurement?.raw?.firmware_version || deviceUsbMeasurement?.firmware_version || deviceUsbInfo?.firmware_version || deviceDbData?.firmware_version
                    const source = deviceUsbMeasurement?.firmware_version || deviceUsbInfo?.firmware_version ? 'usb' : (deviceDbData?.firmware_version ? 'database' : null)
                    const timestamp = deviceUsbMeasurement?.timestamp || deviceUsbInfo?.last_seen || deviceDbData?.last_seen
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${!firmwareVersion ? 'text-gray-400 dark:text-gray-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                            {firmwareVersion || 'N/A'}
                          </span>
                          {firmwareVersion && source && (
                            <span className="text-[10px] opacity-60" title={source === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {source === 'usb' ? '🔌' : '💾'}
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
                <td className="px-3 py-1.5">
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
                          {hasModemData && source && (
                            <span className="text-[10px] opacity-60" title={source === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {source === 'usb' ? '🔌' : '💾'}
                            </span>
                          )}
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
                
                {/* GPS - USB en priorité, puis DB */}
                <td className="px-3 py-1.5">
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
                    const hasGps = lat != null && lon != null && lat !== 0 && lon !== 0 && !isNaN(lat) && !isNaN(lon)
                    const source = latInfo.source || lonInfo.source || (usbLat != null ? 'usb' : null)
                    const timestamp = latInfo.timestamp || lonInfo.timestamp || deviceUsbMeasurement?.timestamp
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${!hasGps || isNaN(lat) || isNaN(lon) ? 'text-gray-400 dark:text-gray-500' : 'text-green-600 dark:text-green-400'}`}>
                            {hasGps && !isNaN(lat) && !isNaN(lon) ? `${Number(lat).toFixed(4)}, ${Number(lon).toFixed(4)}` : 'N/A'}
                          </span>
                          {hasGps && source && (
                            <span className="text-[10px] opacity-60" title={source === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {source === 'usb' ? '🔌' : '💾'}
                            </span>
                          )}
                        </div>
                        {hasGps && timestamp && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {formatTime(timestamp)}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Débit - USB en priorité */}
                <td className="px-3 py-1.5">
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
                          {flowrate != null && !isNaN(flowrate) && (flowrateInfo.source || (usbFlowrate != null ? 'usb' : (deviceDbData?.last_flowrate != null ? 'database' : null))) && (
                            <span className="text-[10px] opacity-60" title={(flowrateInfo.source || (usbFlowrate != null ? 'usb' : 'database')) === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {(flowrateInfo.source || (usbFlowrate != null ? 'usb' : 'database')) === 'usb' ? '🔌' : '💾'}
                            </span>
                          )}
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
                <td className="px-3 py-1.5">
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
                          {battery != null && !isNaN(battery) && (batteryInfo.source || (usbBattery != null ? 'usb' : (deviceDbData?.last_battery != null ? 'database' : null))) && (
                            <span className="text-[10px] opacity-60" title={(batteryInfo.source || (usbBattery != null ? 'usb' : 'database')) === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {(batteryInfo.source || (usbBattery != null ? 'usb' : 'database')) === 'usb' ? '🔌' : '💾'}
                            </span>
                          )}
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
                <td className="px-3 py-1.5">
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
                          {hasRssi && (rssiInfo.source || (usbRssi != null ? 'usb' : (deviceDbData?.last_rssi != null ? 'database' : null))) && (
                            <span className="text-[10px] opacity-60" title={(rssiInfo.source || (usbRssi != null ? 'usb' : 'database')) === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {(rssiInfo.source || (usbRssi != null ? 'usb' : 'database')) === 'usb' ? '🔌' : '💾'}
                            </span>
                          )}
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
                <td className="px-3 py-1.5">
                  {(() => {
                    const usbCount = isDeviceUsbConnected ? (usbStreamMeasurements?.length || 0) : 0
                    const dbCount = deviceDbData ? 1 : 0  // Si données DB, au moins 1 mesure
                    const count = usbCount || dbCount
                    const source = usbCount > 0 ? 'usb' : (dbCount > 0 ? 'database' : null)
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${count === 0 ? 'text-gray-400 dark:text-gray-500' : 'text-purple-600 dark:text-purple-400'}`}>
                            {count}
                          </span>
                          {count > 0 && source && (
                            <span className="text-[10px] opacity-60" title={source === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {source === 'usb' ? '🔌' : '💾'}
                            </span>
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
                <td className="px-3 py-1.5">
                  {(() => {
                    const usbTimestamp = isDeviceUsbConnected ? (usbStreamLastUpdate || deviceUsbMeasurement?.timestamp || deviceUsbInfo?.last_seen) : null
                    const dbTimestamp = deviceDbData?.last_seen
                    const timestamp = usbTimestamp || dbTimestamp
                    const source = usbTimestamp ? 'usb' : (dbTimestamp ? 'database' : null)
                    const timeDiff = timestamp ? Math.floor((currentTime - timestamp) / 1000) : null
                    const isRecent = timeDiff != null && timeDiff < 60
                    return (
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-1">
                          <span className={`text-xs font-semibold ${!isRecent ? 'text-gray-400 dark:text-gray-500' : 'text-green-600 dark:text-green-400'}`}>
                            {timeDiff != null ? `${timeDiff}s` : 'Jamais'}
                          </span>
                          {timestamp && source && (
                            <span className="text-[10px] opacity-60" title={source === 'usb' ? 'Source: USB' : 'Source: Base de données'}>
                              {source === 'usb' ? '🔌' : '💾'}
                            </span>
                          )}
                        </div>
                        {timestamp && (
                          <span className="text-[10px] text-gray-500 dark:text-gray-400">
                            {new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )
                  })()}
                </td>
                
                {/* Actions */}
                <td className="px-3 py-1.5">
                  <button
                    onClick={() => handleDeleteDevice(device)}
                    disabled={deleting}
                    className="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title={device.patient_id ? 'Supprimer (nécessite confirmation)' : 'Supprimer'}
                  >
                    {deleting ? '⏳' : '🗑️'}
                  </button>
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

        {/* Configuration */}
        <div className="mb-6">
          <DeviceConfigSection 
            connectedSimIccid={usbDeviceInfo?.sim_iccid}
            connectedDeviceSerial={usbDeviceInfo?.device_serial}
            usbDeviceInfo={usbDeviceInfo}
            isDisabled={isDisabled}
            isConnected={isConnected}
            appendUsbStreamLog={appendUsbStreamLog}
            sendCommand={sendCommand}
          />
        </div>

        {/* Console de logs USB */}
        <div className="mb-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                📡 Console de Logs USB
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Logs en temps réel du streaming USB et des actions du dashboard
              </p>
            </div>
            {/* Statut USB aligné à droite */}
            <div className="px-3 py-1.5 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
              <div className="flex items-center gap-2 text-xs">
                <span className="font-semibold text-gray-700 dark:text-gray-300">Statut USB:</span>
                <span className={`px-2 py-0.5 rounded font-medium ${
                  isConnected 
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' 
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400'
                }`}>
                  {isConnected ? '🔌 Connecté' : '⚪ Non connecté'}
                </span>
                {usbDeviceInfo && (
                  <span className="text-gray-600 dark:text-gray-400">
                    {usbDeviceInfo.device_name || usbDeviceInfo.sim_iccid || usbDeviceInfo.device_serial || 'Dispositif USB'}
                  </span>
                )}
                {usbVirtualDevice && !usbDeviceInfo && (
                  <span className="text-orange-600 dark:text-orange-400">
                    Dispositif virtuel: {usbVirtualDevice.device_name || usbVirtualDevice.sim_iccid || usbVirtualDevice.device_serial}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div 
            className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-900 p-4 shadow-inner overflow-y-auto" 
            style={{ minHeight: '500px', maxHeight: '600px' }}
          >
            {usbStreamLogs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
                <span className="text-4xl">📡</span>
                <p className="font-medium">En attente de logs USB...</p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Connectez un dispositif USB et démarrez le streaming pour voir les logs
                </p>
              </div>
            ) : (
              <div className="space-y-1 font-mono text-sm tracking-tight">
                {[...usbStreamLogs].reverse().map((log) => {
                  const isDashboard = log.source === 'dashboard'
                  return (
                  <div key={log.id} className="whitespace-pre-wrap">
                    <span className="text-gray-500 pr-3">{new Date(log.timestamp).toLocaleTimeString('fr-FR')}</span>
                      <span className={isDashboard 
                        ? 'text-blue-400 dark:text-blue-300' 
                        : 'text-green-400 dark:text-green-300'
                      }>
                        {log.line}
                      </span>
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}

// Composant de configuration intégré (série + OTA)
function DeviceConfigSection({ connectedSimIccid, connectedDeviceSerial, usbDeviceInfo, isDisabled, isConnected, appendUsbStreamLog, sendCommand }) {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const { usbConnectedDevice, usbVirtualDevice } = useUsb()
  const { data: devicesData, error: devicesError, loading: devicesLoading } = useApiData(
    ['/api.php/devices'], 
    { requiresAuth: true, autoLoad: !!user }
  )
  const devices = devicesData?.devices?.devices || []
  
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [config, setConfig] = useState({
    sleep_minutes: null,
    measurement_duration_ms: null,
    send_every_n_wakeups: null,
    calibration_coefficients: [0, 1, 0]
  })
  
  // Debug: Log de la configuration pour vérifier qu'elle est bien chargée
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && config) {
      logger.debug('📋 Configuration actuelle:', {
        sleep_minutes: config.sleep_minutes,
        measurement_duration_ms: config.measurement_duration_ms,
        send_every_n_wakeups: config.send_every_n_wakeups,
        calibration_coefficients: config.calibration_coefficients
      })
    }
  }, [config])
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  // Configuration toujours visible - pas de masquage

  // Auto-sélectionner le dispositif connecté en série
  // Priorité : sim_iccid > device_serial
  useEffect(() => {
    if (!isConnected || devices.length === 0) {
      setSelectedDeviceId(null)
      return
    }

    let connectedDevice = null

    // 1. Chercher par sim_iccid si disponible
    if (connectedSimIccid) {
      connectedDevice = devices.find(d => d.sim_iccid === connectedSimIccid)
      if (connectedDevice) {
        setSelectedDeviceId(connectedDevice.id.toString())
        return
      }
    }

    // 2. Fallback : chercher par device_serial si sim_iccid n'est pas disponible
    if (connectedDeviceSerial) {
      connectedDevice = devices.find(d => d.device_serial === connectedDeviceSerial)
      if (connectedDevice) {
        setSelectedDeviceId(connectedDevice.id.toString())
        return
      }
    }

    // 3. Si aucun dispositif trouvé, réinitialiser
    if (!connectedDevice) {
      setSelectedDeviceId(null)
    }
  }, [connectedSimIccid, connectedDeviceSerial, isConnected, devices])

  // Charger la configuration du dispositif sélectionné
  const loadDeviceConfig = useCallback(async (deviceId) => {
    if (!deviceId) {
      setConfig({
        sleep_minutes: null,
        measurement_duration_ms: null,
        send_every_n_wakeups: null,
        calibration_coefficients: [0, 1, 0]
      })
      return
    }

    setLoadingConfig(true)
    setError(null)
    try {
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${deviceId}/config`,
        { method: 'GET' },
        { requiresAuth: true }
      )

      if (response.config) {
        setConfig(prev => ({
          // Mettre à jour depuis la DB, mais conserver les valeurs USB si disponibles (priorité USB)
          sleep_minutes: prev.sleep_minutes ?? response.config.sleep_minutes ?? null,
          measurement_duration_ms: prev.measurement_duration_ms ?? response.config.measurement_duration_ms ?? null,
          send_every_n_wakeups: response.config.send_every_n_wakeups ?? prev.send_every_n_wakeups ?? 1, // Toujours depuis DB (firmware ne l'envoie pas)
          calibration_coefficients: prev.calibration_coefficients && Array.isArray(prev.calibration_coefficients) && prev.calibration_coefficients.length === 3
            ? prev.calibration_coefficients
            : (response.config.calibration_coefficients 
                ? (Array.isArray(response.config.calibration_coefficients) 
                    ? response.config.calibration_coefficients 
                    : JSON.parse(response.config.calibration_coefficients))
                : [0, 1, 0])
        }))
        if (process.env.NODE_ENV === 'development') {
          logger.debug('📋 Configuration chargée depuis DB:', {
            sleep_minutes: response.config.sleep_minutes,
            measurement_duration_ms: response.config.measurement_duration_ms,
            send_every_n_wakeups: response.config.send_every_n_wakeups,
            calibration_coefficients: response.config.calibration_coefficients
          })
        }
      }
    } catch (err) {
      logger.error('Erreur chargement configuration:', err)
      setError(err.message || 'Erreur lors du chargement de la configuration')
    } finally {
      setLoadingConfig(false)
    }
  }, [fetchWithAuth, API_URL])

  // Charger la configuration depuis la DB si un dispositif est sélectionné
  // IMPORTANT: On charge TOUJOURS depuis la DB pour avoir send_every_n_wakeups
  // même si on est connecté en USB (car le firmware n'envoie pas ce paramètre)
  useEffect(() => {
    if (selectedDeviceId) {
      // Charger depuis la DB pour avoir send_every_n_wakeups
      loadDeviceConfig(selectedDeviceId)
    } else if (!usbDeviceInfo?.config) {
      // Réinitialiser seulement si pas de config USB
      setConfig({
        sleep_minutes: null,
        measurement_duration_ms: null,
        send_every_n_wakeups: null,
        calibration_coefficients: [0, 1, 0]
      })
    }
  }, [selectedDeviceId, loadDeviceConfig])

  // Initialiser la configuration depuis USB si disponible (priorité USB)
  // Cette configuration est envoyée par le firmware dès la connexion USB
  // IMPORTANT: On conserve send_every_n_wakeups depuis la DB (le firmware ne l'envoie pas)
  useEffect(() => {
    if (usbDeviceInfo?.config && isConnected) {
      const usbConfig = usbDeviceInfo.config
      logger.log('⚙️ usbDeviceInfo.config détecté, mise à jour de la configuration:', usbConfig)
      setConfig(prev => {
        // Toujours mettre à jour avec les valeurs USB si disponibles (source de vérité)
        // MAIS conserver send_every_n_wakeups depuis la DB (le firmware ne l'envoie pas)
        const newConfig = {
          sleep_minutes: usbConfig.sleep_minutes != null ? usbConfig.sleep_minutes : prev.sleep_minutes,
          measurement_duration_ms: usbConfig.measurement_duration_ms != null ? usbConfig.measurement_duration_ms : prev.measurement_duration_ms,
          send_every_n_wakeups: prev.send_every_n_wakeups ?? 1, // Pas envoyé par le firmware, conserver depuis DB ou défaut
          calibration_coefficients: usbConfig.calibration_coefficients && Array.isArray(usbConfig.calibration_coefficients)
            ? usbConfig.calibration_coefficients
            : prev.calibration_coefficients
        }
        logger.log('⚙️ Configuration mise à jour depuis USB:', newConfig)
        return newConfig
      })
    } else {
      logger.debug('⚙️ Pas de config USB disponible:', { hasConfig: !!usbDeviceInfo?.config, isConnected })
    }
  }, [usbDeviceInfo?.config, isConnected])

  // Écouter la configuration reçue depuis le dispositif USB
  useEffect(() => {
    const handleConfigReceived = (event) => {
      const deviceConfig = event.detail
      logger.log('⚙️ Événement usb-device-config-received reçu:', deviceConfig)
      
      // Mettre à jour la configuration avec les valeurs du dispositif
      // IMPORTANT : Utiliser les valeurs du firmware comme source de vérité (priorité USB)
      // Ne pas renvoyer automatiquement pour éviter les boucles infinies
      setConfig(prev => ({
        // Utiliser les valeurs du firmware si disponibles, sinon conserver les valeurs existantes
        sleep_minutes: deviceConfig.sleep_minutes !== null && deviceConfig.sleep_minutes !== undefined 
          ? deviceConfig.sleep_minutes 
          : prev.sleep_minutes,
        measurement_duration_ms: deviceConfig.measurement_duration_ms !== null && deviceConfig.measurement_duration_ms !== undefined
          ? deviceConfig.measurement_duration_ms
          : prev.measurement_duration_ms,
        send_every_n_wakeups: prev.send_every_n_wakeups ?? 1, // Pas envoyé par le firmware (géré par dashboard/DB)
        calibration_coefficients: deviceConfig.calibration_coefficients && Array.isArray(deviceConfig.calibration_coefficients)
          ? deviceConfig.calibration_coefficients
          : prev.calibration_coefficients
      }))
      
      // Si on a un selectedDeviceId, recharger depuis la DB pour avoir send_every_n_wakeups
      if (selectedDeviceId) {
        loadDeviceConfig(selectedDeviceId)
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('usb-device-config-received', handleConfigReceived)
      return () => {
        window.removeEventListener('usb-device-config-received', handleConfigReceived)
      }
    }
  }, [])

  // Vérifier si un dispositif est reconnu (USB ou base de données)
  const isDeviceRecognized = useMemo(() => {
    // Vérifier si on a un dispositif USB connecté avec des informations
    const hasUsbDevice = isConnected && (
      usbDeviceInfo?.sim_iccid || 
      usbDeviceInfo?.device_serial || 
      usbDeviceInfo?.device_name || 
      !!usbConnectedDevice || 
      !!usbVirtualDevice
    )
    
    // Vérifier si on a un dispositif sélectionné dans la base de données
    const hasDbDevice = selectedDeviceId && devices.find(d => d.id === parseInt(selectedDeviceId))
    
    return hasUsbDevice || hasDbDevice
  }, [isConnected, usbDeviceInfo, usbConnectedDevice, usbVirtualDevice, selectedDeviceId, devices])

  // Sauvegarder la configuration
  const handleSave = useCallback(async (e) => {
    e.preventDefault()
    
    // Si connecté en USB, on peut configurer même sans dispositif dans la base de données
    if (!isConnected && !selectedDeviceId) {
      setError('Aucun dispositif sélectionné et aucun dispositif connecté en USB')
      return
    }
    
    // Vérifier que le dispositif est bien reconnu
    if (!isDeviceRecognized) {
      setError('Sélectionnez un dispositif de la base de données ou connectez un dispositif USB.')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const selectedDevice = selectedDeviceId ? devices.find(d => d.id === parseInt(selectedDeviceId)) : null

      // 1. Mettre à jour la base de données si un dispositif est sélectionné
      if (selectedDevice) {
        const updateData = {}
        if (config.sleep_minutes !== null && config.sleep_minutes !== '') {
          updateData.sleep_minutes = parseInt(config.sleep_minutes)
        }
        if (config.measurement_duration_ms !== null && config.measurement_duration_ms !== '') {
          updateData.measurement_duration_ms = parseInt(config.measurement_duration_ms)
        }
        if (config.send_every_n_wakeups !== null && config.send_every_n_wakeups !== '') {
          updateData.send_every_n_wakeups = parseInt(config.send_every_n_wakeups)
        }
        if (config.calibration_coefficients && Array.isArray(config.calibration_coefficients)) {
          updateData.calibration_coefficients = config.calibration_coefficients
        }

        try {
          await fetchJson(
            fetchWithAuth,
            API_URL,
            `/api.php/devices/${selectedDeviceId}/config`,
            {
              method: 'PUT',
              body: JSON.stringify(updateData)
            },
            { requiresAuth: true }
          )
        } catch (dbErr) {
          logger.warn('Erreur mise à jour base de données (continuation):', dbErr)
          // On continue quand même si on est connecté en USB
          if (!isConnected) {
            throw dbErr
          }
        }
      }

      // 2. Si connecté en USB, envoyer directement les commandes au firmware
      if (isConnected && sendCommand) {
        appendUsbStreamLog('📤 Envoi de la configuration directement au dispositif via USB...', 'dashboard')
        
        // Envoyer la commande config si des paramètres de configuration sont présents
        // NOTE: send_every_n_wakeups n'est PAS envoyé au firmware (géré uniquement par dashboard/DB)
        const hasConfigParams = 
          (config.sleep_minutes !== null && config.sleep_minutes !== '') ||
          (config.measurement_duration_ms !== null && config.measurement_duration_ms !== '')

        if (hasConfigParams) {
          const configPayload = {}
          if (config.sleep_minutes !== null && config.sleep_minutes !== '') {
            configPayload.sleep_minutes = parseInt(config.sleep_minutes)
          }
          if (config.measurement_duration_ms !== null && config.measurement_duration_ms !== '') {
            configPayload.measurement_duration_ms = parseInt(config.measurement_duration_ms)
          }
          // send_every_n_wakeups n'est PAS envoyé au firmware (géré uniquement par dashboard/DB)
          
          const configCommand = `config ${JSON.stringify(configPayload)}`
          await sendCommand(configCommand)
          appendUsbStreamLog('✅ Configuration envoyée au dispositif', 'dashboard')
        }

        // Envoyer la commande calibration si des coefficients sont présents
        if (config.calibration_coefficients && Array.isArray(config.calibration_coefficients)) {
          const calA0 = config.calibration_coefficients[0]
          const calA1 = config.calibration_coefficients[1]
          const calA2 = config.calibration_coefficients[2]
          
          if (calA0 !== undefined && calA1 !== undefined && calA2 !== undefined) {
            const calibrationPayload = { a0: calA0, a1: calA1, a2: calA2 }
            const calibrationCommand = `calibration ${JSON.stringify(calibrationPayload)}`
            await sendCommand(calibrationCommand)
            appendUsbStreamLog('✅ Calibration envoyée au dispositif', 'dashboard')
          }
        }

        setSuccess(selectedDevice 
          ? 'Configuration sauvegardée dans la base de données et appliquée directement au dispositif via USB.'
          : 'Configuration appliquée directement au dispositif via USB (dispositif non trouvé dans la base de données).')
      } else if (selectedDevice && selectedDevice.sim_iccid) {
        // 3. Si pas connecté en USB, créer des commandes OTA pour appliquer la configuration
        const configForCommand = {
          sleep_minutes: config.sleep_minutes,
          measurement_duration_ms: config.measurement_duration_ms,
          send_every_n_wakeups: config.send_every_n_wakeups
        }
        
        const hasConfigParams = 
          (config.sleep_minutes !== null && config.sleep_minutes !== '') ||
          (config.measurement_duration_ms !== null && config.measurement_duration_ms !== '') ||
          (config.send_every_n_wakeups !== null && config.send_every_n_wakeups !== '')

        if (hasConfigParams) {
          try {
            await createUpdateConfigCommand(
              fetchWithAuth,
              API_URL,
              selectedDevice.sim_iccid,
              configForCommand,
              { priority: 'normal', expiresInSeconds: 7 * 24 * 60 * 60 }
            )
            appendUsbStreamLog('✅ Commande UPDATE_CONFIG créée - La configuration sera appliquée au prochain réveil du dispositif (mode OTA)', 'dashboard')
          } catch (cmdErr) {
            logger.error('Erreur création commande OTA UPDATE_CONFIG:', cmdErr)
          }
        }

        // Créer une commande UPDATE_CALIBRATION séparée pour les coefficients
        if (config.calibration_coefficients && Array.isArray(config.calibration_coefficients)) {
          const calA0 = config.calibration_coefficients[0]
          const calA1 = config.calibration_coefficients[1]
          const calA2 = config.calibration_coefficients[2]
          
          if (calA0 !== undefined && calA1 !== undefined && calA2 !== undefined) {
            try {
              await createUpdateCalibrationCommand(
                fetchWithAuth,
                API_URL,
                selectedDevice.sim_iccid,
                calA0,
                calA1,
                calA2,
                { priority: 'normal', expiresInSeconds: 7 * 24 * 60 * 60 }
              )
              appendUsbStreamLog('✅ Commande UPDATE_CALIBRATION créée - La calibration sera appliquée au prochain réveil du dispositif (mode OTA)', 'dashboard')
            } catch (cmdErr) {
              logger.error('Erreur création commande OTA UPDATE_CALIBRATION:', cmdErr)
            }
          }
        }

        setSuccess('Configuration sauvegardée dans la base de données. Commande OTA créée - La configuration sera appliquée au prochain réveil du dispositif (mode OTA).')
      }

      appendUsbStreamLog('✅ Configuration sauvegardée', 'dashboard')
    } catch (err) {
      logger.error('Erreur sauvegarde configuration:', err)
      setError(err.message || 'Erreur lors de la sauvegarde de la configuration')
      appendUsbStreamLog(`❌ Erreur sauvegarde configuration: ${err.message || err}`, 'dashboard')
    } finally {
      setSaving(false)
    }
  }, [selectedDeviceId, config, devices, isConnected, sendCommand, fetchWithAuth, API_URL, appendUsbStreamLog])

  return (
    <div className="h-full">
      <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 h-full flex flex-col">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <span className="text-lg">⚙️</span>
            Configuration
          </h3>
        </div>

        {/* Sélection de dispositif depuis la base de données */}
        {!isConnected && (
          <div className="mb-4">
            {devicesLoading ? (
              <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                Chargement des dispositifs...
              </div>
            ) : devices.length === 0 ? null : (
              <select
                value={selectedDeviceId || ''}
                onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">-- Aucun dispositif sélectionné --</option>
                {devices.map((device) => (
                  <option key={device.id} value={device.id.toString()}>
                    {device.device_name || device.sim_iccid || device.device_serial || `Dispositif #${device.id}`}
                    {device.patient_id && ` (${device.first_name} ${device.last_name})`}
                  </option>
                ))}
              </select>
            )}
            {devicesError && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Erreur chargement dispositifs: {devicesError.message}
              </p>
            )}
          </div>
        )}

        <>
            {!isConnected && selectedDeviceId && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📡</span>
                  <div>
                    <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">
                      Dispositif sélectionné (mode OTA)
                    </p>
                    {devices.find(d => d.id === parseInt(selectedDeviceId)) && (
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        {devices.find(d => d.id === parseInt(selectedDeviceId)).device_name || 
                         devices.find(d => d.id === parseInt(selectedDeviceId)).sim_iccid}
                      </p>
                    )}
                    <p className="text-xs text-blue-500 dark:text-blue-500 mt-1">
                      Les modifications seront envoyées via OTA et appliquées au prochain réveil
                    </p>
                  </div>
                </div>
              </div>
            )}

            {(error || devicesError) && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-300">
                  {error || devicesError?.message || 'Erreur'}
                </p>
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-800 dark:text-green-300">
                  {success}
                </p>
              </div>
            )}

            {loadingConfig && (
              <div className="mb-4 text-center text-sm text-gray-500 dark:text-gray-400">
                Chargement de la configuration...
              </div>
            )}

            {/* Configuration sur une seule ligne */}
            <div className="overflow-x-auto mb-4">
              <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  {/* Intervalle de veille */}
                  <div className="flex flex-col gap-1 min-w-[140px]">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                      <span>⏰</span>
                      <span>Intervalle de veille</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="10080"
                        value={config.sleep_minutes ?? ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, sleep_minutes: e.target.value ? parseInt(e.target.value) : null }))}
                        disabled={saving || (!isConnected && !selectedDeviceId)}
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="minutes"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">min</span>
                    </div>
                  </div>

                  {/* Durée de mesure */}
                  <div className="flex flex-col gap-1 min-w-[140px]">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                      <span>⏱️</span>
                      <span>Durée de mesure</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="100"
                        max="60000"
                        value={config.measurement_duration_ms ?? ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, measurement_duration_ms: e.target.value ? parseInt(e.target.value) : null }))}
                        disabled={saving || (!isConnected && !selectedDeviceId)}
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="ms"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">ms</span>
                    </div>
                  </div>

                  {/* Envoyer toutes les N réveils */}
                  <div className="flex flex-col gap-1 min-w-[140px]">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                      <span>📤</span>
                      <span>Envoyer toutes les N réveils</span>
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="255"
                        value={config.send_every_n_wakeups ?? ''}
                        onChange={(e) => setConfig(prev => ({ ...prev, send_every_n_wakeups: e.target.value ? parseInt(e.target.value) : null }))}
                        disabled={saving || (!isConnected && !selectedDeviceId)}
                        className="flex-1 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        placeholder="réveils"
                      />
                      <span className="text-xs text-gray-600 dark:text-gray-400 whitespace-nowrap">réveils</span>
                    </div>
                  </div>

                  {/* Coefficients de calibration */}
                  <div className="flex flex-col gap-1 min-w-[200px]">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 flex items-center gap-1">
                      <span>📐</span>
                      <span>Calibration (a0, a1, a2)</span>
                    </label>
                    <div className="flex items-center gap-1">
                      {[0, 1, 2].map((idx) => {
                        // Vérifier si les données de calibration ont été reçues depuis USB
                        const hasUsbCalibration = usbDeviceInfo?.config?.calibration_coefficients && Array.isArray(usbDeviceInfo.config.calibration_coefficients)
                        // Griser si pas de données USB ET pas de dispositif sélectionné
                        const isCalibrationDisabled = saving || (!isConnected && !selectedDeviceId) || (isConnected && !hasUsbCalibration && !selectedDeviceId)
                        
                        return (
                          <input
                            key={idx}
                            type="number"
                            step="0.000001"
                            value={(config.calibration_coefficients && config.calibration_coefficients[idx]) ?? (idx === 1 ? 1 : 0)}
                            onChange={(e) => {
                              const newCoeffs = [...(config.calibration_coefficients || [0, 1, 0])]
                              newCoeffs[idx] = parseFloat(e.target.value) || 0
                              setConfig(prev => ({ ...prev, calibration_coefficients: newCoeffs }))
                            }}
                            disabled={isCalibrationDisabled}
                            placeholder={`a${idx}`}
                            className="w-20 px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                        )
                      })}
                    </div>
                  </div>

                  {/* Bouton de sauvegarde */}
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300 opacity-0">
                      Action
                    </label>
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        handleSave(e)
                      }}
                      disabled={isDisabled || saving || !isDeviceRecognized}
                      className="px-3 py-1 text-xs bg-primary-500 hover:bg-primary-600 text-white rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      title={!isDeviceRecognized ? 'Sélectionnez un dispositif ou connectez un dispositif USB' : isConnected ? 'Appliquer via USB' : selectedDeviceId ? 'Appliquer via OTA' : ''}
                    >
                      {saving ? '⏳' : '💾 Sauvegarder'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Bouton de sauvegarde globale */}
            {isDeviceRecognized && (
              <div className="mt-4">
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    handleSave(e)
                  }}
                  disabled={isDisabled || saving}
                  className="w-full px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? '⏳ Sauvegarde en cours...' : isConnected ? '💾 Sauvegarder et appliquer via USB' : selectedDeviceId ? '📡 Sauvegarder et envoyer via OTA' : '💾 Sauvegarder'}
                </button>
              </div>
            )}
          </>
      </div>
    </div>
  )
}

