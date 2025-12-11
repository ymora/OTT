'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useUsb } from '@/contexts/UsbContext'
import { useSerialPort } from '@/components/SerialPortManager'
import { useTimers } from '@/hooks'
import { ESPLoader } from 'esptool-js'
import logger from '@/lib/logger'

/**
 * Modal unifié pour le flash USB et OTA
 * Avec barre de progression, logs et stats
 */
export default function FlashModal({ isOpen, onClose, device, preselectedFirmwareVersion = null, flashMode = 'usb' }) {
  const { fetchWithAuth, API_URL } = useAuth()
  const [firmwares, setFirmwares] = useState([])
  const [selectedFirmware, setSelectedFirmware] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [flashing, setFlashing] = useState(false)
  const [flashProgress, setFlashProgress] = useState(0)
  const [terminalLogs, setTerminalLogs] = useState([])
  const [flashComplete, setFlashComplete] = useState(false)
  const [deviceAlive, setDeviceAlive] = useState(null)
  const [flashModeState, setFlashModeState] = useState(flashMode) // 'usb' ou 'ota'
  const [otaStatus, setOtaStatus] = useState(null) // { status: 'pending'|'executing'|'executed'|'error', command: {...} }
  const [otaStats, setOtaStats] = useState({ lastCheck: null, attempts: 0 })
  const [downloadProgress, setDownloadProgress] = useState(0) // Progression du téléchargement (0-100)
  const [cacheUsed, setCacheUsed] = useState(false) // Indique si le cache navigateur a été utilisé
  const [downloadStatus, setDownloadStatus] = useState(null) // Message de statut du téléchargement
  const stopReadingRef = useRef(null)
  const otaCheckIntervalRef = useRef(null)
  
  // Utiliser le hook useTimers pour gérer les timers avec cleanup automatique
  const { createTimeout: createTimeoutWithCleanup, createInterval } = useTimers()
  
  // Nettoyer l'interval OTA au démontage
  useEffect(() => {
    return () => {
      if (otaCheckIntervalRef.current) {
        clearInterval(otaCheckIntervalRef.current)
      }
    }
  }, [])

  // Utiliser le contexte USB partagé
  const {
    isConnected: usbIsConnected,
    isSupported: usbIsSupported,
    usbStreamStatus,
    pauseUsbStreaming
  } = useUsb()

  // Gestion du port série (instance séparée pour le flash USB)
  const {
    port,
    isConnected,
    isSupported,
    error: serialError,
    requestPort,
    connect,
    disconnect,
    startReading,
    write
  } = useSerialPort()
  
  useEffect(() => {
    // Mettre en pause le streaming seulement si :
    // 1. Le modal est ouvert
    // 2. L'appareil est connecté
    // 3. Le streaming est actif (running, waiting, ou connecting)
    const isStreamingActive = usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting'
    
    if (isOpen && usbIsConnected && isStreamingActive && pauseUsbStreaming) {
      logger.log('⏸️ Mise en pause du streaming USB pour libérer le port pour le flash')
      pauseUsbStreaming()
    }
  }, [isOpen, usbIsConnected, usbStreamStatus, pauseUsbStreaming])

  // Charger les firmwares
  const loadFirmwares = useCallback(async () => {
    try {
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/firmwares',
        {},
        { requiresAuth: true }
      )
      setFirmwares(data.firmwares || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [API_URL, fetchWithAuth])

  // Charger au montage
  useEffect(() => {
    if (isOpen) {
      loadFirmwares()
      setFlashModeState(flashMode)
      setFlashProgress(0)
      setFlashComplete(false)
      setDeviceAlive(null)
      setOtaStatus(null)
      setOtaStats({ lastCheck: null, attempts: 0 })
      setTerminalLogs([])
      setError(null)
    }
  }, [isOpen, loadFirmwares, flashMode])

  // Pré-sélectionner le firmware
  useEffect(() => {
    if (preselectedFirmwareVersion && firmwares.length > 0) {
      const firmware = firmwares.find(fw => fw.version === preselectedFirmwareVersion)
      if (firmware) {
        setSelectedFirmware(firmware)
      }
    }
  }, [preselectedFirmwareVersion, firmwares])

  // Fonction pour rafraîchir les données
  const refreshDevices = useCallback(async () => {
    try {
      await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/devices',
        { method: 'GET' },
        { requiresAuth: true }
      )
      logger.log('✅ Dispositifs rafraîchis après mise à jour firmware')
    } catch (err) {
      logger.warn('⚠️ Erreur rafraîchissement dispositifs:', err)
    }
  }, [fetchWithAuth, API_URL])

  // Gérer la connexion USB
  const handleConnect = useCallback(async () => {
    try {
      // Mettre en pause le streaming seulement s'il est actif (pour libérer le port)
      const isStreamingActive = usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting'
      if (isStreamingActive && pauseUsbStreaming) {
        logger.log('⏸️ Mise en pause du streaming USB avant connexion pour flash')
        pauseUsbStreaming()
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      const selectedPort = await requestPort()
      if (selectedPort) {
        const connected = await connect(selectedPort, 115200)
        if (connected) {
          const stopReading = await startReading((data) => {
            setTerminalLogs(prev => [...prev, { raw: data, timestamp: new Date() }])
          })
          if (stopReading) {
            stopReadingRef.current = stopReading
          }
        } else if (serialError) {
          setError(serialError)
        }
      }
    } catch (err) {
      logger.error('Erreur connexion port pour flash:', err)
      setError(`Erreur de connexion: ${err.message}`)
    }
  }, [requestPort, connect, startReading, pauseUsbStreaming, serialError, usbStreamStatus])

  const handleDisconnect = useCallback(async () => {
    if (stopReadingRef.current) {
      stopReadingRef.current()
      stopReadingRef.current = null
    }
    await disconnect()
    setTerminalLogs([])
  }, [disconnect])

  // Télécharger le firmware
  const downloadFirmware = useCallback(async (firmware) => {
    const token = localStorage.getItem('token')
    if (!token) throw new Error('Token manquant')

    // Réinitialiser les états de téléchargement
    setDownloadProgress(0)
    setCacheUsed(false)
    setDownloadStatus('Téléchargement en cours...')

    try {
      const response = await fetch(`${API_URL}/api.php/firmwares/${firmware.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })

      // Détecter si le cache a été utilisé (HTTP 304 Not Modified)
      if (response.status === 304) {
        setCacheUsed(true)
        setDownloadStatus('✅ Fichier chargé depuis le cache navigateur (pas de téléchargement nécessaire)')
        setDownloadProgress(100)
        // Pour HTTP 304, on doit quand même récupérer le blob depuis le cache
        // Le navigateur le fournira automatiquement
        return await response.blob()
      }

      if (!response.ok) {
        throw new Error(`Erreur téléchargement: ${response.status} ${response.statusText}`)
      }

      // Suivre la progression du téléchargement
      const contentLength = response.headers.get('content-length')
      const total = contentLength ? parseInt(contentLength, 10) : 0

      if (total === 0) {
        // Si la taille n'est pas connue, on télécharge directement
        setDownloadStatus('Téléchargement en cours...')
        const blob = await response.blob()
        setDownloadProgress(100)
        setDownloadStatus('✅ Téléchargement terminé')
        return blob
      }

      // Télécharger avec suivi de progression
      const reader = response.body.getReader()
      const chunks = []
      let received = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        chunks.push(value)
        received += value.length
        const percent = Math.round((received / total) * 100)
        setDownloadProgress(percent)
        setDownloadStatus(`Téléchargement: ${percent}% (${(received / 1024 / 1024).toFixed(2)} MB / ${(total / 1024 / 1024).toFixed(2)} MB)`)
      }

      // Reconstruire le blob
      const blob = new Blob(chunks)
      setDownloadProgress(100)
      setDownloadStatus('✅ Téléchargement terminé')
      return blob

    } catch (error) {
      setDownloadStatus(`❌ Erreur: ${error.message}`)
      throw error
    }
  }, [API_URL])

  // Vérifier le statut OTA
  const checkOtaStatus = useCallback(async () => {
    if (!device?.id) return

    try {
      const commandsData = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}/commands`,
        { method: 'GET' },
        { requiresAuth: true }
      )

      const commands = commandsData.commands || []
      // Trouver la commande OTA_REQUEST la plus récente
      const otaCommand = commands
        .filter(cmd => cmd.command === 'OTA_REQUEST')
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

      if (otaCommand) {
        setOtaStatus({
          status: otaCommand.status,
          command: otaCommand,
          message: getOtaStatusMessage(otaCommand.status)
        })

        setOtaStats(prev => ({
          lastCheck: new Date(),
          attempts: prev.attempts + 1
        }))

        // Si la commande est exécutée, le flash est terminé
        if (otaCommand.status === 'executed') {
          setFlashComplete(true)
          setFlashProgress(100)
          setTerminalLogs(prev => [...prev, { 
            raw: '[OTA] ✅ Flash OTA terminé avec succès !', 
            timestamp: new Date() 
          }])
          
          // Mettre à jour la version firmware dans la base
          if (selectedFirmware) {
            try {
              await fetchJson(
                fetchWithAuth,
                API_URL,
                `/api.php/devices/${device.id}`,
                {
                  method: 'PUT',
                  body: JSON.stringify({ firmware_version: selectedFirmware.version })
                },
                { requiresAuth: true }
              )
              await refreshDevices()
            } catch (updateErr) {
              logger.warn('⚠️ Erreur mise à jour version firmware:', updateErr)
            }
          }

          // Arrêter la vérification
          if (otaCheckIntervalRef.current) {
            clearInterval(otaCheckIntervalRef.current)
            otaCheckIntervalRef.current = null
          }
        } else if (otaCommand.status === 'error') {
          setFlashComplete(true)
          setError('Erreur lors du flash OTA')
          setTerminalLogs(prev => [...prev, { 
            raw: '[OTA] ❌ Erreur lors du flash OTA', 
            timestamp: new Date() 
          }])
          
          if (otaCheckIntervalRef.current) {
            clearInterval(otaCheckIntervalRef.current)
            otaCheckIntervalRef.current = null
          }
        }
      }
    } catch (err) {
      logger.warn('⚠️ Erreur vérification statut OTA:', err)
    }
  }, [device, fetchWithAuth, API_URL, selectedFirmware, refreshDevices])

  const getOtaStatusMessage = (status) => {
    switch (status) {
      case 'pending': return 'En attente d\'exécution'
      case 'executing': return 'Flash en cours...'
      case 'executed': return 'Flash terminé avec succès'
      case 'error': return 'Erreur lors du flash'
      case 'expired': return 'Commande expirée'
      case 'cancelled': return 'Commande annulée'
      default: return 'Statut inconnu'
    }
  }

  // Flasher via USB
  const handleFlashUSB = useCallback(async () => {
    if (!selectedFirmware || !isConnected || !port) {
      setError('Sélectionnez un firmware et connectez un port')
      return
    }

    setFlashing(true)
    setError(null)
    setFlashProgress(0)
    setFlashComplete(false)
    // Réinitialiser les états de téléchargement
    setDownloadProgress(0)
    setCacheUsed(false)
    setDownloadStatus(null)

    try {
      setFlashProgress(5)
      addLog('[USB] Téléchargement du firmware...')
      const firmwareBlob = await downloadFirmware(selectedFirmware)
      // Le message de statut (cache ou téléchargement) est déjà affiché dans l'UI via downloadStatus
      // On l'affiche aussi dans les logs pour cohérence
      if (downloadStatus) {
        addLog(`[USB] ${downloadStatus}`)
      }
      setFlashProgress(10)
      const firmwareArrayBuffer = await firmwareBlob.arrayBuffer()

      const terminal = {
        clean: () => {},
        writeLine: (data) => addLog(`[ESPTOOL] ${data}`),
        write: (data) => addLog(`[ESPTOOL] ${data}`)
      }

      setFlashProgress(20)
      addLog('[USB] Connexion au dispositif...')
      const loader = new ESPLoader(port, terminal, 115200)
      setFlashProgress(25)
      await loader.connect()
      setFlashProgress(30)
      addLog('[USB] Connexion établie, début du flash...')

      const offset = 0x1000
      const firmwareData = new Uint8Array(firmwareArrayBuffer)
      setFlashProgress(40)

      if (typeof loader.flashData === 'function') {
        await loader.flashData(firmwareData, offset)
      } else if (typeof loader.flash_file === 'function') {
        await loader.flash_file(firmwareData, offset)
      } else if (typeof loader.write === 'function') {
        await loader.write(offset, firmwareData)
      } else {
        throw new Error('Méthode de flash non trouvée')
      }

      setFlashProgress(90)
      if (typeof loader.verify === 'function') {
        addLog('[USB] Vérification du flash...')
        await loader.verify(offset, firmwareData)
      }
      setFlashProgress(100)
      setFlashComplete(true)
      addLog('[USB] ✅ Flash réussi !')

      // Mettre à jour la version firmware dans la base
      // Chercher le dispositif par ID, ICCID, serial ou device_name
      if (selectedFirmware) {
        try {
          addLog('[UPDATE] Recherche du dispositif dans la base...')
          
          let deviceId = null
          
          // Si on a un ID direct, l'utiliser
          if (device?.id) {
            deviceId = device.id
          } else {
            // Sinon, chercher dans la base par ICCID, serial ou device_name
            const devicesResponse = await fetchJson(
              fetchWithAuth,
              API_URL,
              '/api.php/devices',
              { method: 'GET' },
              { requiresAuth: true }
            )
            const allDevices = devicesResponse.devices || []
            
            // Chercher par ICCID
            if (device?.sim_iccid) {
              const found = allDevices.find(d => d.sim_iccid === device.sim_iccid)
              if (found) deviceId = found.id
            }
            
            // Chercher par device_serial
            if (!deviceId && device?.device_serial) {
              const found = allDevices.find(d => d.device_serial === device.device_serial)
              if (found) deviceId = found.id
            }
            
            // Chercher par device_name (USB-xxx:yyy ou correspondance partielle)
            if (!deviceId && device?.device_name) {
              const usbIdMatch = device.device_name.match(/USB-([a-f0-9:]+)/i)
              if (usbIdMatch) {
                const usbId = usbIdMatch[1].toLowerCase()
                // Chercher par USB ID dans device_name
                const found = allDevices.find(d => {
                  if (d.device_name) {
                    const nameMatch = d.device_name.match(/USB-([a-f0-9:]+)/i)
                    if (nameMatch && nameMatch[1].toLowerCase() === usbId) return true
                    if (d.device_name.toLowerCase().includes(usbId)) return true
                  }
                  if (d.device_serial && d.device_serial.toLowerCase().includes(usbId)) return true
                  // Chercher aussi dans sim_iccid si c'est un TEMP-xxx avec le même identifiant
                  if (d.sim_iccid && d.sim_iccid.includes(usbId.replace(':', ''))) return true
                  return false
                })
                if (found) deviceId = found.id
              } else {
                // Si pas de format USB-xxx:yyy, chercher correspondance partielle dans device_name
                const found = allDevices.find(d => {
                  if (d.device_name && (d.device_name.includes(device.device_name) || device.device_name.includes(d.device_name))) return true
                  return false
                })
                if (found) deviceId = found.id
              }
            }
            
            // Chercher aussi par correspondance partielle d'ICCID (pour TEMP-xxx)
            if (!deviceId && device?.sim_iccid) {
              // Extraire la partie numérique de TEMP-xxx
              const tempMatch = device.sim_iccid.match(/TEMP-([0-9a-f]+)/i)
              if (tempMatch) {
                const tempId = tempMatch[1]
                const found = allDevices.find(d => {
                  // Chercher dans sim_iccid, device_serial ou device_name
                  if (d.sim_iccid && d.sim_iccid.includes(tempId)) return true
                  if (d.device_serial && d.device_serial.includes(tempId)) return true
                  if (d.device_name && d.device_name.includes(tempId)) return true
                  return false
                })
                if (found) deviceId = found.id
              }
            }
          }
          
          if (deviceId) {
            addLog(`[UPDATE] Dispositif trouvé (ID: ${deviceId}), mise à jour version firmware...`)
            await fetchJson(
              fetchWithAuth,
              API_URL,
              `/api.php/devices/${deviceId}`,
              {
                method: 'PUT',
                body: JSON.stringify({ firmware_version: selectedFirmware.version })
              },
              { requiresAuth: true }
            )
            addLog(`[UPDATE] ✅ Version firmware mise à jour: v${selectedFirmware.version}`)
            await refreshDevices()
          } else {
            addLog(`[UPDATE] ⚠️ Dispositif non trouvé en base - la version sera mise à jour lors de la prochaine connexion USB`)
            logger.warn('Dispositif non trouvé pour mise à jour firmware:', device)
          }
        } catch (updateErr) {
          logger.warn('⚠️ Erreur mise à jour version firmware:', updateErr)
          addLog(`[UPDATE] ⚠️ Erreur mise à jour: ${updateErr.message}`)
        }
      }

      // Vérifier si le dispositif est vivant
      addLog('[TEST] Attente redémarrage (3 secondes)...')
      await new Promise(resolve => setTimeout(resolve, 3000))

      try {
        addLog('[TEST] Envoi commande AT pour vérifier...')
        await write('AT\r\n')

        let hasResponse = false
        const responseCheck = setInterval(() => {
          const recentLogs = terminalLogs.slice(-10)
          const foundResponse = recentLogs.some(log =>
            log.raw && (
              log.raw.includes('OK') ||
              log.raw.includes('device_info') ||
              log.raw.includes('AT') ||
              log.raw.includes('ready')
            )
          )
          if (foundResponse && !hasResponse) {
            hasResponse = true
            setDeviceAlive(true)
            addLog('[TEST] ✅ Dispositif répond !')
          }
        }, 500)

        createTimeoutWithCleanup(() => {
          clearInterval(responseCheck)
          if (!hasResponse) {
            setDeviceAlive(false)
            addLog('[TEST] ⚠️ Pas de réponse détectée')
          }
        }, 5000)
      } catch (testErr) {
        addLog(`[TEST] ⚠️ Erreur test: ${testErr.message}`)
      }
    } catch (err) {
      setError(err.message)
      addLog(`[USB] ❌ Erreur: ${err.message}`)
    } finally {
      setFlashing(false)
    }
  }, [selectedFirmware, isConnected, port, downloadFirmware, device, fetchWithAuth, API_URL, write, refreshDevices, terminalLogs])

  // Flasher via OTA
  const handleFlashOTA = useCallback(async () => {
    if (!selectedFirmware || !device?.id) {
      setError('Sélectionnez un firmware et un dispositif')
      return
    }

    setFlashing(true)
    setError(null)
    setFlashProgress(0)
    setFlashComplete(false)
    setOtaStatus(null)
    setOtaStats({ lastCheck: null, attempts: 0 })

    try {
      addLog('[OTA] Déclenchement du flash OTA...')
      setFlashProgress(10)

      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}/ota`,
        {
          method: 'POST',
          body: JSON.stringify({ firmware_version: selectedFirmware.version })
        },
        { requiresAuth: true }
      )

      setFlashProgress(30)
      addLog(`[OTA] ✅ Commande OTA programmée pour v${selectedFirmware.version}`)
      addLog('[OTA] Attente de l\'exécution par le dispositif...')
      setOtaStatus({ status: 'pending', message: 'En attente d\'exécution' })

      // Démarrer la vérification périodique du statut
      otaCheckIntervalRef.current = setInterval(() => {
        checkOtaStatus()
      }, 2000) // Vérifier toutes les 2 secondes

      // Timeout après 5 minutes
      const timeoutId = createTimeoutWithCleanup(() => {
        if (otaCheckIntervalRef.current) {
          clearInterval(otaCheckIntervalRef.current)
          otaCheckIntervalRef.current = null
        }
        if (!flashComplete) {
          setError('Timeout: Le flash OTA n\'a pas été exécuté dans les 5 minutes')
          addLog('[OTA] ⚠️ Timeout: Flash OTA non exécuté')
        }
      }, 5 * 60 * 1000)

    } catch (err) {
      setError(err.message)
      addLog(`[OTA] ❌ Erreur: ${err.message}`)
      setFlashing(false)
    }
  }, [selectedFirmware, device, fetchWithAuth, API_URL, checkOtaStatus, flashComplete])

  // Fonction helper pour ajouter des logs
  const addLog = useCallback((message) => {
    setTerminalLogs(prev => [...prev, { raw: message, timestamp: new Date() }])
  }, [])

  // Nettoyer les intervalles au démontage
  useEffect(() => {
    return () => {
      if (otaCheckIntervalRef.current) {
        clearInterval(otaCheckIntervalRef.current)
      }
    }
  }, [])

  if (!isOpen) return null

  const canFlashUSB = flashModeState === 'usb' && isConnected && selectedFirmware
  const canFlashOTA = flashModeState === 'ota' && device?.id && selectedFirmware

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {flashModeState === 'usb' ? '🔌 Flash USB' : '📡 Flash OTA'}
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {device ? `${device.device_name || device.sim_iccid}` : 'Flasher un dispositif'}
            </p>
          </div>
          <button 
            onClick={onClose} 
            className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
            title="Fermer"
            aria-label="Fermer"
          >
            <span className="text-2xl font-bold leading-none">×</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Sélection mode */}
          <div className="flex gap-2">
            <button
              onClick={() => setFlashModeState('usb')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                flashModeState === 'usb'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              🔌 USB
            </button>
            <button
              onClick={() => setFlashModeState('ota')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                flashModeState === 'ota'
                  ? 'bg-primary-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              📡 OTA
            </button>
          </div>

          {/* Configuration */}
          <div className="grid grid-cols-2 gap-4">
            {/* Port série (USB uniquement) */}
            {flashModeState === 'usb' && (
              <div>
                <label className="block text-sm font-medium mb-2">📡 Port série</label>
                {!isConnected ? (
                  <button
                    onClick={handleConnect}
                    disabled={!isSupported || flashing}
                    className="btn-primary w-full text-sm"
                  >
                    🔌 Sélectionner
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2 text-sm">
                      <p className="text-green-800 dark:text-green-300 font-semibold">● Connecté</p>
                    </div>
                    <button onClick={handleDisconnect} disabled={flashing} className="btn-secondary w-full text-xs">
                      Déconnecter
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Firmware */}
            <div className={flashModeState === 'usb' ? '' : 'col-span-2'}>
              <label className="block text-sm font-medium mb-2">📦 Firmware</label>
              {loading ? (
                <p className="text-sm text-gray-500">Chargement...</p>
              ) : (
                <select
                  value={selectedFirmware?.id || ''}
                  onChange={(e) => {
                    const fw = firmwares.find(f => f.id === parseInt(e.target.value))
                    setSelectedFirmware(fw || null)
                  }}
                  disabled={flashing}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700 text-sm"
                >
                  <option value="">Sélectionner...</option>
                  {firmwares
                    .filter(fw => fw.status === 'compiled')
                    .map((fw) => (
                      <option key={fw.id} value={fw.id}>
                        v{fw.version} {fw.is_stable ? '✅' : '⚠️'}
                      </option>
                    ))}
                </select>
              )}
            </div>
          </div>

          {/* Bouton flash */}
          {(canFlashUSB || canFlashOTA) && (
            <div>
              <button
                onClick={flashModeState === 'usb' ? handleFlashUSB : handleFlashOTA}
                disabled={flashing}
                className="btn-primary w-full"
              >
                {flashing
                  ? `⏳ Flash en cours... ${flashProgress}%`
                  : `🚀 Flasher v${selectedFirmware.version} (${flashModeState.toUpperCase()})`}
              </button>

              {/* Barre de progression du téléchargement */}
              {downloadProgress > 0 && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      {downloadStatus || 'Téléchargement en cours...'}
                    </span>
                    <span className="font-semibold">{downloadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        cacheUsed ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </div>
                  {cacheUsed && (
                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">
                      ✅ Fichier chargé depuis le cache navigateur (pas de téléchargement nécessaire)
                    </p>
                  )}
                </div>
              )}

              {/* Barre de progression du flash */}
              {flashing && downloadProgress >= 100 && flashProgress > 0 && (
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">
                      Flash en cours...
                    </span>
                    <span className="font-semibold">{flashProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className="bg-primary-500 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${flashProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Stats OTA */}
              {flashModeState === 'ota' && otaStatus && (
                <div className="mt-3 p-3 rounded-lg border-2 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-blue-800 dark:text-blue-300">
                        Statut: {otaStatus.message}
                      </p>
                      {otaStatus.command && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          Commande créée: {new Date(otaStatus.command.created_at).toLocaleString('fr-FR')}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-blue-600 dark:text-blue-400">
                        Vérifications: {otaStats.attempts}
                      </p>
                      {otaStats.lastCheck && (
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          Dernière: {otaStats.lastCheck.toLocaleTimeString('fr-FR')}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Statut après flash */}
              {flashComplete && (
                <div className="mt-3 p-3 rounded-lg border-2">
                  {deviceAlive === true && (
                    <div className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                      <p className="text-green-800 dark:text-green-300 font-semibold">✅ Dispositif vivant et répond</p>
                    </div>
                  )}
                  {deviceAlive === false && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
                      <p className="text-yellow-800 dark:text-yellow-300 font-semibold">⚠️ Pas de réponse détectée</p>
                    </div>
                  )}
                  {flashModeState === 'ota' && otaStatus?.status === 'executed' && (
                    <div className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                      <p className="text-green-800 dark:text-green-300 font-semibold">✅ Flash OTA terminé avec succès</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Console de logs */}
          <div>
            <label className="block text-sm font-medium mb-2">📟 Console</label>
            <div className="bg-black text-green-400 font-mono text-xs p-4 rounded-lg h-64 overflow-y-auto">
              {terminalLogs.length === 0 ? (
                <p className="text-gray-500">En attente de logs...</p>
              ) : (
                terminalLogs.map((log, idx) => (
                  <div key={idx} className="mb-1">
                    <span className="text-gray-500">
                      {log.timestamp.toLocaleTimeString('fr-FR')}
                    </span>
                    {' '}
                    <span>{log.raw}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Erreurs */}
          {(error || serialError) && (
            <div className="alert alert-warning text-sm">
              {error || serialError}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

