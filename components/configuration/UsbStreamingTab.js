'use client'

import { useState, useEffect, useRef } from 'react'
import { useUsb } from '@/contexts/UsbContext'
import { getUsbDeviceLabel } from '@/lib/usbDevices'
import logger from '@/lib/logger'

export default function UsbStreamingTab() {
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
    disconnect,
    startReading,
    write,
    startUsbStreaming,
    pauseUsbStreaming,
    appendUsbStreamLog
  } = useUsb()
  
  const [availablePorts, setAvailablePorts] = useState([])
  const [selectedPortId, setSelectedPortId] = useState('')
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  const [modemStatus, setModemStatus] = useState('stopped') // 'stopped', 'starting', 'running', 'stopping'
  const [sendingCommand, setSendingCommand] = useState(false)
  const [currentTime, setCurrentTime] = useState(Date.now()) // Pour rafraîchir l'affichage de la dernière mise à jour
  
  // Suivi des valeurs min/max
  const [minMaxValues, setMinMaxValues] = useState({
    flowrate: { min: null, max: null },
    battery: { min: null, max: null },
    rssi: { min: null, max: null }
  })

  // Charger les ports disponibles au montage et périodiquement
  const loadAvailablePorts = async () => {
    if (!isSupported) return
    
    setLoadingPorts(true)
    try {
      const ports = await navigator.serial.getPorts()
      const portsList = ports.map((p, index) => {
        const info = p.getInfo?.()
        const label = getUsbDeviceLabel(info) || 
          (info ? `VID ${info.usbVendorId?.toString(16).padStart(4, '0')} · PID ${info.usbProductId?.toString(16).padStart(4, '0')}` : `Port ${index + 1}`)
        return {
          port: p,
          id: `port-${index}`,
          label,
          info
        }
      })
      
      setAvailablePorts(portsList)
      
      // Si un port est sélectionné mais n'existe plus, réinitialiser
      if (selectedPortId && !portsList.find(p => p.id === selectedPortId)) {
        setSelectedPortId('')
      }
      
      // Sélection automatique du port si connecté (priorité : port actuel > dispositif connecté)
      if (!selectedPortId && port) {
        const currentPortIndex = ports.findIndex(p => p === port)
        if (currentPortIndex >= 0) {
          setSelectedPortId(`port-${currentPortIndex}`)
        }
      } else if (!selectedPortId && (usbConnectedDevice || usbVirtualDevice) && ports.length > 0) {
        // Si on a un dispositif connecté mais pas de port sélectionné, prendre le premier port disponible
        // (normalement il n'y en a qu'un si le dispositif est connecté)
        if (ports.length === 1) {
          setSelectedPortId('port-0')
        }
      }
    } catch (err) {
      logger.error('[UsbStreamingTab] Erreur chargement ports:', err)
    } finally {
      setLoadingPorts(false)
    }
  }

  useEffect(() => {
    if (!isSupported) return
    loadAvailablePorts()
    // Recharger périodiquement (toutes les 5 secondes)
    const interval = setInterval(loadAvailablePorts, 5000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, port, usbConnectedDevice, usbVirtualDevice])

  // Sélection automatique du port dès qu'il est disponible
  useEffect(() => {
    if (!isSupported || !port || selectedPortId) return
    
    const selectPort = async () => {
      try {
        const ports = await navigator.serial.getPorts()
        const currentPortIndex = ports.findIndex(p => p === port)
        if (currentPortIndex >= 0) {
          setSelectedPortId(`port-${currentPortIndex}`)
        }
      } catch (err) {
        logger.error('[UsbStreamingTab] Erreur sélection automatique port:', err)
      }
    }
    
    selectPort()
  }, [isSupported, port, selectedPortId])

  // Gérer la sélection d'un port
  const handlePortSelect = async (portId) => {
    if (portId === 'new') {
      // Demander un nouveau port
      try {
        appendUsbStreamLog('🔍 Demande d\'un nouveau port USB...', 'dashboard')
        const newPort = await requestPort()
        if (newPort) {
          appendUsbStreamLog('✅ Port USB autorisé', 'dashboard')
          await loadAvailablePorts()
          // Sélectionner le nouveau port
          const ports = await navigator.serial.getPorts()
          const newPortIndex = ports.findIndex(p => p === newPort)
          if (newPortIndex >= 0) {
            setSelectedPortId(`port-${newPortIndex}`)
            // Se connecter automatiquement au nouveau port
            appendUsbStreamLog('🔌 Connexion au nouveau port...', 'dashboard')
            const connected = await connect(newPort, 115200)
            if (connected) {
              appendUsbStreamLog('✅ Connexion USB établie', 'dashboard')
            } else {
              appendUsbStreamLog('❌ Échec de la connexion', 'dashboard')
            }
          }
        }
      } catch (err) {
        logger.error('[UsbStreamingTab] Erreur demande nouveau port:', err)
        appendUsbStreamLog(`❌ Erreur: ${err.message || err}`, 'dashboard')
      }
    } else if (portId) {
      // Port sélectionné dans le menu déroulant
      setSelectedPortId(portId)
      // Se connecter automatiquement au port sélectionné
      const selectedPortData = availablePorts.find(p => p.id === portId)
      if (selectedPortData && !isConnected) {
        appendUsbStreamLog(`🔌 Connexion au port: ${selectedPortData.label}...`, 'dashboard')
        try {
          const connected = await connect(selectedPortData.port, 115200)
          if (connected) {
            appendUsbStreamLog('✅ Connexion USB établie', 'dashboard')
          } else {
            appendUsbStreamLog('❌ Échec de la connexion', 'dashboard')
          }
        } catch (err) {
          logger.error('[UsbStreamingTab] Erreur connexion port sélectionné:', err)
          appendUsbStreamLog(`❌ Erreur connexion: ${err.message || err}`, 'dashboard')
        }
      }
    } else {
      // Aucun port sélectionné
      setSelectedPortId('')
    }
  }

  // Toggle pause/reprise
  const handleToggleStreaming = async () => {
    if (isToggling) return
    
    setIsToggling(true)
    try {
      if (usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting') {
        // Mettre en pause (garde le port connecté et les logs)
        logger.debug('[UsbStreamingTab] Pause du streaming...')
        pauseUsbStreaming()
        // Attendre un peu pour que le streaming se mette en pause
        await new Promise(resolve => setTimeout(resolve, 300))
        logger.debug('[UsbStreamingTab] Streaming en pause, port toujours connecté')
      } else if (usbStreamStatus === 'paused') {
        // Reprendre depuis la pause
        logger.debug('[UsbStreamingTab] Reprise du streaming...')
        // Le port est déjà connecté, on peut reprendre directement
        if (!port) {
          throw new Error('Port non disponible pour la reprise')
        }
        await startUsbStreaming(port)
      } else {
        // Démarrer (première fois)
        // Si on est déjà connecté, utiliser le port actuel
        if (isConnected && port) {
          await startUsbStreaming(port)
        } else if (selectedPortId) {
          // Utiliser le port sélectionné
          const selectedPortData = availablePorts.find(p => p.id === selectedPortId)
          if (!selectedPortData) {
            alert('Port sélectionné introuvable')
            setIsToggling(false)
            return
          }
          
          // Connecter directement au port sélectionné
          const connected = await connect(selectedPortData.port, 115200)
          if (!connected) {
            throw new Error('Échec de la connexion au port USB')
          }
          
          // Attendre un peu pour que la connexion soit stable et que le state soit mis à jour
          await new Promise(resolve => setTimeout(resolve, 500))
          
          // Passer explicitement le port à startUsbStreaming
          await startUsbStreaming(selectedPortData.port)
        } else {
          // Aucun port sélectionné ni connecté - demander un nouveau port
          const newPort = await requestPort()
          if (newPort) {
            const connected = await connect(newPort, 115200)
            if (!connected) {
              throw new Error('Échec de la connexion au port USB')
            }
            await new Promise(resolve => setTimeout(resolve, 500))
            await startUsbStreaming(newPort)
          } else {
            alert('Aucun port USB sélectionné')
            setIsToggling(false)
            return
          }
        }
      }
    } catch (err) {
      logger.error('[UsbStreamingTab] Erreur toggle streaming:', err)
      alert(`Erreur: ${err.message || err}`)
    } finally {
      setIsToggling(false)
    }
  }

  // Mettre à jour les valeurs min/max à chaque nouvelle mesure
  useEffect(() => {
    if (usbStreamLastMeasurement) {
      setMinMaxValues(prev => {
        const newValues = { ...prev }
        
        // Débit
        if (usbStreamLastMeasurement.flowrate !== null && usbStreamLastMeasurement.flowrate !== undefined) {
          if (newValues.flowrate.min === null || usbStreamLastMeasurement.flowrate < newValues.flowrate.min) {
            newValues.flowrate.min = usbStreamLastMeasurement.flowrate
          }
          if (newValues.flowrate.max === null || usbStreamLastMeasurement.flowrate > newValues.flowrate.max) {
            newValues.flowrate.max = usbStreamLastMeasurement.flowrate
          }
        }
        
        // Batterie
        if (usbStreamLastMeasurement.battery !== null && usbStreamLastMeasurement.battery !== undefined) {
          if (newValues.battery.min === null || usbStreamLastMeasurement.battery < newValues.battery.min) {
            newValues.battery.min = usbStreamLastMeasurement.battery
          }
          if (newValues.battery.max === null || usbStreamLastMeasurement.battery > newValues.battery.max) {
            newValues.battery.max = usbStreamLastMeasurement.battery
          }
        }
        
        // RSSI - Exclure -999 du calcul des min/max (valeur sentinelle pour "pas de signal")
        if (usbStreamLastMeasurement.rssi !== null && usbStreamLastMeasurement.rssi !== undefined) {
          const rssiValue = usbStreamLastMeasurement.rssi
          // Ignorer -999 qui signifie "pas de signal" ou "erreur"
          if (rssiValue !== -999) {
            if (newValues.rssi.min === null || rssiValue < newValues.rssi.min) {
              newValues.rssi.min = rssiValue
            }
            if (newValues.rssi.max === null || rssiValue > newValues.rssi.max) {
              newValues.rssi.max = rssiValue
            }
          }
        }
        
        return newValues
      })
    }
  }, [usbStreamLastMeasurement])
  
  // Réinitialiser les min/max quand on démarre un nouveau streaming
  useEffect(() => {
    if (usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting') {
      setMinMaxValues({
        flowrate: { min: null, max: null },
        battery: { min: null, max: null },
        rssi: { min: null, max: null }
      })
    }
  }, [usbStreamStatus])

  // Détecter l'état du modem depuis les logs
  useEffect(() => {
    if (usbStreamLogs.length === 0) return
    
    const lastLogs = usbStreamLogs.slice(-5) // Vérifier les 5 derniers logs
    for (const log of lastLogs) {
      const line = log.line || ''
      if (line.includes('✅ Modem démarré avec succès') || line.includes('Modem démarré')) {
        setModemStatus('running')
      } else if (line.includes('✅ Modem arrêté') || line.includes('Modem arrêté')) {
        setModemStatus('stopped')
      } else if (line.includes('Démarrage du modem')) {
        setModemStatus('starting')
      } else if (line.includes('Arrêt du modem')) {
        setModemStatus('stopping')
      }
    }
  }, [usbStreamLogs])

  // Fonction pour envoyer une commande au dispositif
  const sendCommand = async (command) => {
    logger.log(`[USB] sendCommand appelé: ${command}`)
    logger.log(`[USB] État: isConnected=${isConnected}, port=${!!port}, sendingCommand=${sendingCommand}, isStreaming=${isStreaming}`)
    
    if (!isConnected) {
      logger.error('[USB] sendCommand: Port non connecté')
      appendUsbStreamLog('❌ Port non connecté - Connectez-vous d\'abord', 'dashboard')
      return
    }
    
    if (!port) {
      logger.error('[USB] sendCommand: Port non disponible')
      appendUsbStreamLog('❌ Port non disponible', 'dashboard')
      return
    }
    
    if (sendingCommand) {
      logger.warn('[USB] sendCommand: Commande déjà en cours d\'envoi')
      appendUsbStreamLog('⏳ Commande déjà en cours d\'envoi...', 'dashboard')
      return
    }
    
    // Certaines commandes peuvent être envoyées même sans streaming actif
    const commandsAllowedWithoutStreaming = ['device_info', 'help']
    if (!isStreaming && !commandsAllowedWithoutStreaming.includes(command)) {
      logger.warn('[USB] sendCommand: Streaming non actif - Les commandes ne seront pas lues par le firmware')
      appendUsbStreamLog('⚠️ Streaming non actif - Démarrez le streaming d\'abord', 'dashboard')
      return
    }
    
    setSendingCommand(true)
    try {
      // La fonction write attend une string et fait l'encodage elle-même
      const commandWithNewline = command + '\n'
      logger.log(`[USB] Envoi de la commande: "${commandWithNewline}"`)
      appendUsbStreamLog(`📤 Envoi commande: ${command}`, 'dashboard')
      const result = await write(commandWithNewline)
      if (result) {
        logger.log(`[USB] ✅ Commande "${command}" envoyée avec succès`)
        appendUsbStreamLog(`✅ Commande "${command}" envoyée avec succès`, 'dashboard')
      } else {
        logger.error(`[USB] ❌ Échec envoi commande "${command}"`)
        appendUsbStreamLog(`❌ Échec envoi commande: ${command}`, 'dashboard')
      }
    } catch (err) {
      logger.error('[USB] Erreur envoi commande:', err)
      appendUsbStreamLog(`❌ Erreur envoi commande: ${err.message || err}`, 'dashboard')
    } finally {
      setSendingCommand(false)
    }
  }

  // Handlers pour les commandes modem
  const handleModemOn = () => {
    sendCommand('modem_on')
    setModemStatus('starting')
  }

  const handleModemOff = () => {
    sendCommand('modem_off')
    setModemStatus('stopping')
  }

  const handleTestNetwork = () => {
    sendCommand('test_network')
  }

  const handleTestGps = () => {
    sendCommand('gps')
  }

  // Handler pour demander une mesure immédiate
  const handleRequestMeasurement = () => {
    appendUsbStreamLog('📊 Demande d\'une mesure immédiate...', 'dashboard')
    sendCommand('once')
  }

  // Handler pour demander les infos du dispositif
  const handleRequestDeviceInfo = () => {
    appendUsbStreamLog('ℹ️ Demande des informations du dispositif...', 'dashboard')
    sendCommand('device_info')
  }

  const isStreaming = usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting'
  const isPaused = usbStreamStatus === 'paused'
  // Peut démarrer si : port sélectionné OU déjà connecté OU streaming actif/en pause
  const canToggle = isSupported && !isToggling && (selectedPortId || isConnected || isStreaming || isPaused)
  
  // Les sections ne doivent pas être grisées dès qu'on est connecté en USB
  // isReady = connecté en USB (peut démarrer le streaming ou utiliser les commandes)
  const isReady = isConnected || isStreaming || isPaused
  const isDisabled = !isConnected // Grisé si déconnecté

  // Rafraîchir l'affichage de la dernière mise à jour toutes les secondes
  useEffect(() => {
    if (!isReady || !usbStreamLastUpdate) return
    
    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [isReady, usbStreamLastUpdate])

  return (
    <div className="space-y-6">
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

        {/* Menu déroulant seulement si plusieurs ports disponibles et non connecté */}
        {isSupported && !isConnected && availablePorts.length > 1 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Port USB
            </label>
            <select
              value={selectedPortId}
              onChange={(e) => handlePortSelect(e.target.value)}
              disabled={isStreaming || loadingPorts}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">
                {loadingPorts ? 'Chargement...' : 'Sélectionner un port'}
              </option>
              {availablePorts.map((portData) => (
                <option key={portData.id} value={portData.id}>
                  {portData.label}
                </option>
              ))}
              <option value="new">➕ Autoriser un nouveau port...</option>
            </select>
          </div>
        )}


        {/* Info dispositif - Utiliser uniquement les données reçues du dispositif USB */}
        {usbDeviceInfo && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Dispositif : {usbDeviceInfo.device_name || usbDeviceInfo.sim_iccid || usbDeviceInfo.device_serial || 'Inconnu'}
            </p>
            {usbDeviceInfo.sim_iccid && (
              <p className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-1">
                ICCID: {usbDeviceInfo.sim_iccid}
              </p>
            )}
          </div>
        )}


        {/* 4 sections en lignes avec indicateurs en colonne */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Section 1 : État de connexion */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">🔌 État de connexion</h3>
            {/* Connexion USB avec icône cliquable */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    if (isConnected) {
                      // Si connecté, déconnecter
                      appendUsbStreamLog('🔌 Déconnexion USB demandée...', 'dashboard')
                      try {
                        await disconnect()
                        appendUsbStreamLog('✅ Déconnexion USB réussie', 'dashboard')
                        await loadAvailablePorts()
                      } catch (err) {
                        logger.error('[UsbStreamingTab] Erreur déconnexion USB:', err)
                        appendUsbStreamLog(`❌ Erreur déconnexion: ${err.message || err}`, 'dashboard')
                      }
                    } else {
                      // Si non connecté, vérifier si un port est déjà sélectionné
                      if (selectedPortId && availablePorts.length > 0) {
                        // Se connecter au port sélectionné
                        const selectedPortData = availablePorts.find(p => p.id === selectedPortId)
                        if (selectedPortData) {
                          appendUsbStreamLog(`🔌 Connexion au port sélectionné: ${selectedPortData.label}...`, 'dashboard')
                          try {
                            const connected = await connect(selectedPortData.port, 115200)
                            if (connected) {
                              appendUsbStreamLog('✅ Connexion USB établie', 'dashboard')
                              await loadAvailablePorts()
                            } else {
                              appendUsbStreamLog('❌ Échec de la connexion au port', 'dashboard')
                            }
                          } catch (err) {
                            logger.error('[UsbStreamingTab] Erreur connexion port sélectionné:', err)
                            appendUsbStreamLog(`❌ Erreur connexion: ${err.message || err}`, 'dashboard')
                          }
                        } else {
                          appendUsbStreamLog('⚠️ Port sélectionné introuvable, demande d\'un nouveau port...', 'dashboard')
                          // Port sélectionné introuvable, demander un nouveau port
                          try {
                            const newPort = await requestPort()
                            if (newPort) {
                              appendUsbStreamLog('✅ Port USB autorisé, connexion en cours...', 'dashboard')
                              await connect(newPort, 115200)
                              appendUsbStreamLog('✅ Connexion USB établie', 'dashboard')
                              await loadAvailablePorts()
                            }
                          } catch (err) {
                            logger.error('[UsbStreamingTab] Erreur détection USB:', err)
                            appendUsbStreamLog(`❌ Erreur détection USB: ${err.message || err}`, 'dashboard')
                          }
                        }
                      } else {
                        // Aucun port sélectionné, ouvrir le sélecteur de port
                        appendUsbStreamLog('🔍 Détection USB demandée...', 'dashboard')
                        try {
                          const newPort = await requestPort()
                          if (newPort) {
                            appendUsbStreamLog('✅ Port USB autorisé, connexion en cours...', 'dashboard')
                            await connect(newPort, 115200)
                            appendUsbStreamLog('✅ Connexion USB établie', 'dashboard')
                            await loadAvailablePorts()
                          }
                        } catch (err) {
                          logger.error('[UsbStreamingTab] Erreur détection USB:', err)
                          appendUsbStreamLog(`❌ Erreur détection USB: ${err.message || err}`, 'dashboard')
                        }
                      }
                    }
                  }}
                  disabled={loadingPorts || isToggling}
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${
                    isConnected 
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span className="text-xl">🔌</span>
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                    <p className="font-semibold mb-2">
                      {isConnected ? '🔌 Déconnecter USB' : '🔍 Détecter USB'}
                    </p>
                    <p className="text-left">
                      {isConnected 
                        ? 'Déconnecte le port USB série. Le streaming sera arrêté.'
                        : 'Autoriser l\'accès à un port USB série pour connecter le dispositif.'}
                    </p>
                  </div>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Connexion USB</p>
                  <p className={`text-sm font-semibold truncate ${
                    isConnected 
                      ? 'text-green-600 dark:text-green-400' 
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {isConnected ? 'Connecté' : 'Déconnecté'}
                  </p>
                </div>
              </div>
            </div>

            {/* Streaming avec icône cliquable */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleToggleStreaming}
                  disabled={isDisabled || isToggling}
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${
                    isDisabled
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : usbStreamStatus === 'running'
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer'
                      : usbStreamStatus === 'paused'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 cursor-pointer'
                      : usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting'
                      ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 cursor-wait'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <span className="text-xl">
                    {isToggling ? '⏳' :
                     usbStreamStatus === 'running' ? '▶️' : 
                     usbStreamStatus === 'paused' ? '⏸️' : 
                     usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting' ? '⏳' : '⏹️'}
                  </span>
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                    <p className="font-semibold mb-2">
                      {isDisabled ? '⏹️ Streaming non disponible' :
                       usbStreamStatus === 'running' ? '⏸️ Pause du streaming' : 
                       usbStreamStatus === 'paused' ? '▶️ Reprendre le streaming' :
                       usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting' ? '⏳ Connexion en cours...' :
                       '▶️ Démarrer le streaming'}
                    </p>
                    <p className="text-left">
                      {isDisabled 
                        ? 'Connectez-vous d\'abord via USB pour démarrer le streaming.'
                        : usbStreamStatus === 'running'
                        ? 'Mettre en pause le streaming USB. Les logs seront conservés et vous pourrez reprendre le streaming plus tard.'
                        : usbStreamStatus === 'paused'
                        ? 'Reprendre le streaming USB. Les données du dispositif seront à nouveau affichées en temps réel.'
                        : usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting'
                        ? 'Connexion au dispositif en cours, veuillez patienter...'
                        : 'Démarrer le streaming USB pour recevoir les données en temps réel du dispositif.'}
                    </p>
                  </div>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Streaming</p>
                  <p className={`text-sm font-semibold truncate ${
                    isDisabled
                      ? 'text-gray-400 dark:text-gray-500'
                      : usbStreamStatus === 'running'
                      ? 'text-blue-600 dark:text-blue-400'
                      : usbStreamStatus === 'paused'
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting'
                      ? 'text-purple-600 dark:text-purple-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {isDisabled ? 'N/A' :
                     usbStreamStatus === 'running' ? 'En cours' : 
                     usbStreamStatus === 'paused' ? 'En pause' : 
                     usbStreamStatus === 'connecting' ? 'Connexion...' : 
                     usbStreamStatus === 'waiting' ? 'En attente...' : 
                     'Arrêté'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2 : Système */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">📡 Système</h3>

            {/* ICCID/Serial - En haut */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <button
                onClick={handleRequestDeviceInfo}
                disabled={!isConnected || sendingCommand}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${!isConnected ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:bg-orange-200 dark:hover:bg-orange-900/50 cursor-pointer'}`}
              >
                <span className="text-xl">🆔</span>
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                  <p className="font-semibold mb-2">🆔 Demander les informations du dispositif</p>
                  <p className="text-left">
                    Demande au dispositif d'envoyer ses informations (ICCID, Serial, Firmware).
                  </p>
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Identifiant</p>
                <p className={`text-sm font-semibold truncate font-mono ${isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-orange-600 dark:text-orange-400'}`}>
                  {/* Utiliser uniquement les données reçues du dispositif USB en temps réel */}
                  {usbDeviceInfo?.sim_iccid || usbDeviceInfo?.device_serial
                    ? (usbDeviceInfo.sim_iccid || usbDeviceInfo.device_serial)?.slice(-8)
                    : 'N/A'}
                </p>
              </div>
            </div>

            {/* Version firmware - En dessous */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <button
                onClick={handleRequestDeviceInfo}
                disabled={!isConnected || sendingCommand}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${!isConnected ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-200 dark:hover:bg-cyan-900/50 cursor-pointer'}`}
              >
                <span className="text-xl">💾</span>
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                  <p className="font-semibold mb-2">💾 Demander la version du firmware</p>
                  <p className="text-left">
                    Demande au dispositif d'envoyer sa version de firmware.
                  </p>
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Firmware</p>
                <p className={`text-sm font-semibold truncate font-mono ${isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-cyan-600 dark:text-cyan-400'}`}>
                  {/* Utiliser uniquement les données reçues du dispositif USB en temps réel */}
                  {usbStreamLastMeasurement?.raw?.firmware_version || 
                   usbStreamLastMeasurement?.firmware_version ||
                   usbDeviceInfo?.firmware_version || 
                   'N/A'}
                </p>
              </div>
            </div>

            {/* Modem avec contrôles sur la même ligne - En dessous */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (modemStatus === 'running' || modemStatus === 'starting') {
                      handleModemOff()
                    } else {
                      handleModemOn()
                    }
                  }}
                  disabled={!isConnected || sendingCommand || !isStreaming}
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${
                    isDisabled || !isStreaming
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : modemStatus === 'running'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer'
                      : modemStatus === 'starting' || modemStatus === 'stopping'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 cursor-wait'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer'
                  }`}
                >
                  <span className="text-xl">📡</span>
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                    <p className="font-semibold mb-2">
                      {modemStatus === 'running' || modemStatus === 'starting' ? '🛑 Arrêter le modem' : '📡 Démarrer le modem'}
                    </p>
                    <p className="text-left mb-2">
                      {modemStatus === 'running' || modemStatus === 'starting' 
                        ? 'Arrête le modem pour économiser l\'énergie. Le GPS ne sera plus disponible.'
                        : 'Démarre le modem SIM7600 pour activer la connectivité réseau et le GPS.'}
                    </p>
                    <p className="text-left text-gray-400">
                      Les logs s'affichent dans la console ci-dessous.
                    </p>
                  </div>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Modem</p>
                  <p className={`text-sm font-semibold truncate ${
                    isDisabled
                      ? 'text-gray-400 dark:text-gray-500'
                      : modemStatus === 'running'
                      ? 'text-green-600 dark:text-green-400'
                      : modemStatus === 'starting' || modemStatus === 'stopping'
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {isDisabled ? 'N/A' :
                     modemStatus === 'running' ? 'Démarré' : 
                     modemStatus === 'starting' ? 'Démarrage...' : 
                     modemStatus === 'stopping' ? 'Arrêt...' : 
                     'Arrêté'}
                  </p>
                </div>
                {isStreaming && (
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={handleModemOn}
                      disabled={!isConnected || sendingCommand || modemStatus === 'running' || modemStatus === 'starting'}
                      className="w-8 h-8 flex items-center justify-center text-lg rounded bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                    >
                      {modemStatus === 'starting' ? '⏳' : '📡'}
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                        <p className="font-semibold mb-2">📡 Démarrer le modem</p>
                        <p className="text-left mb-2">
                          Démarre le modem SIM7600 pour activer la connectivité réseau et le GPS.
                        </p>
                        <p className="text-left text-gray-400">
                          Les logs du démarrage s'affichent dans la console ci-dessous.
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={handleModemOff}
                      disabled={!isConnected || sendingCommand || modemStatus === 'stopped' || modemStatus === 'stopping'}
                      className="w-8 h-8 flex items-center justify-center text-lg rounded bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                    >
                      {modemStatus === 'stopping' ? '⏳' : '🛑'}
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                        <p className="font-semibold mb-2">🛑 Arrêter le modem</p>
                        <p className="text-left">
                          Arrête le modem pour économiser l'énergie. Le GPS ne sera plus disponible.
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={handleTestNetwork}
                      disabled={!isConnected || sendingCommand || modemStatus !== 'running'}
                      className="w-8 h-8 flex items-center justify-center text-lg rounded bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                    >
                      📶
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                        <p className="font-semibold mb-2">📶 Test réseau</p>
                        <p className="text-left mb-2">
                          Teste l'enregistrement sur le réseau Free et affiche le statut de connexion.
                        </p>
                        <p className="text-left text-gray-400">
                          Le modem doit être démarré pour effectuer ce test. Les résultats s'affichent dans la console.
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* GPS avec contrôles sur la même ligne - En bas */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestGps}
                  disabled={!isConnected || sendingCommand || modemStatus !== 'running' || !isStreaming}
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${
                    isDisabled || !isStreaming || modemStatus !== 'running'
                      ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : isReady && usbStreamLastMeasurement?.latitude && usbStreamLastMeasurement?.longitude
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer'
                  }`}
                >
                  <span className="text-xl">📍</span>
                  <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                    <p className="font-semibold mb-2">📍 Test GPS</p>
                    <p className="text-left mb-2">
                      Teste la réception GPS et affiche la position actuelle du dispositif.
                    </p>
                    <p className="text-left text-yellow-400 mb-2">
                      ⚠️ Important : Le GPS est intégré au modem SIM7600. Le modem doit être démarré pour utiliser le GPS.
                    </p>
                    <p className="text-left text-gray-400">
                      Les résultats s'affichent dans la console ci-dessous.
                    </p>
                  </div>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Position GPS</p>
                  <p className={`text-sm font-semibold truncate ${
                    isDisabled
                      ? 'text-gray-400 dark:text-gray-500'
                      : isReady && usbStreamLastMeasurement?.latitude && usbStreamLastMeasurement?.longitude
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-gray-400 dark:text-gray-500'
                  }`}>
                    {isReady && usbStreamLastMeasurement?.latitude && usbStreamLastMeasurement?.longitude
                      ? `${usbStreamLastMeasurement.latitude.toFixed(6)}, ${usbStreamLastMeasurement.longitude.toFixed(6)}`
                      : 'Non disponible'}
                  </p>
                </div>
                {isStreaming && (
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={handleTestGps}
                      disabled={!isConnected || sendingCommand || modemStatus !== 'running'}
                      className="w-8 h-8 flex items-center justify-center text-lg rounded bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors relative group"
                    >
                      📍
                      <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                        <p className="font-semibold mb-2">📍 Test GPS</p>
                        <p className="text-left mb-2">
                          Teste la réception GPS et affiche la position actuelle du dispositif.
                        </p>
                        <p className="text-left text-yellow-400 mb-2">
                          ⚠️ Important : Le GPS est intégré au modem SIM7600. Le modem doit être démarré pour utiliser le GPS.
                        </p>
                        <p className="text-left text-gray-400">
                          Les résultats s'affichent dans la console ci-dessous.
                        </p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 3 : Mesures en temps réel */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">📊 Mesures</h3>
            {/* Débit */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <button
                onClick={handleRequestMeasurement}
                disabled={!isConnected || sendingCommand || !isStreaming}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${isDisabled || !isStreaming ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50 cursor-pointer'}`}
              >
                <span className="text-xl">💨</span>
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                  <p className="font-semibold mb-2">💨 Demander une mesure immédiate</p>
                  <p className="text-left">
                    Demande au dispositif d'envoyer une mesure immédiate (débit, batterie, RSSI).
                  </p>
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Débit</p>
                <p className={`text-sm font-semibold truncate ${isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-blue-600 dark:text-blue-400'}`}>
                {isReady && usbStreamLastMeasurement?.flowrate !== null && usbStreamLastMeasurement?.flowrate !== undefined
                  ? `${usbStreamLastMeasurement.flowrate.toFixed(2)} L/min`
                  : '0.00 L/min'}
              </p>
              {(minMaxValues.flowrate.min !== null || minMaxValues.flowrate.max !== null) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Min: {minMaxValues.flowrate.min !== null ? `${minMaxValues.flowrate.min.toFixed(2)}` : '-'} | 
                    Max: {minMaxValues.flowrate.max !== null ? `${minMaxValues.flowrate.max.toFixed(2)}` : '-'}
                </p>
              )}
              </div>
            </div>

            {/* Batterie */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <button
                onClick={handleRequestMeasurement}
                disabled={!isConnected || sendingCommand || !isStreaming}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${
                  isDisabled || !isStreaming
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    : isReady && usbStreamLastMeasurement?.battery !== null && usbStreamLastMeasurement?.battery !== undefined
                    ? usbStreamLastMeasurement.battery >= 50
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer'
                      : usbStreamLastMeasurement.battery >= 20
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 cursor-pointer'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 cursor-pointer'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer'
                }`}
              >
                <span className="text-xl">🔋</span>
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                  <p className="font-semibold mb-2">🔋 Demander une mesure immédiate</p>
                  <p className="text-left">
                    Demande au dispositif d'envoyer une mesure immédiate (débit, batterie, RSSI).
                  </p>
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Batterie</p>
                <p className={`text-sm font-semibold truncate ${
                  isDisabled
                    ? 'text-gray-400 dark:text-gray-500'
                    : isReady && usbStreamLastMeasurement?.battery !== null && usbStreamLastMeasurement?.battery !== undefined
                    ? usbStreamLastMeasurement.battery >= 50
                      ? 'text-green-600 dark:text-green-400'
                      : usbStreamLastMeasurement.battery >= 20
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                {isReady && usbStreamLastMeasurement?.battery !== null && usbStreamLastMeasurement?.battery !== undefined
                  ? `${usbStreamLastMeasurement.battery.toFixed(0)}%`
                  : '0%'}
              </p>
              {(minMaxValues.battery.min !== null || minMaxValues.battery.max !== null) && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  Min: {minMaxValues.battery.min !== null ? `${minMaxValues.battery.min.toFixed(0)}` : '-'} | 
                    Max: {minMaxValues.battery.max !== null ? `${minMaxValues.battery.max.toFixed(0)}` : '-'}
                  </p>
                )}
              </div>
            </div>

            {/* RSSI Signal */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <button
                onClick={() => {
                  if (modemStatus === 'running') {
                    handleTestNetwork()
                  } else {
                    appendUsbStreamLog('⚠️ Le modem doit être démarré pour obtenir le RSSI', 'dashboard')
                    handleModemOn()
                  }
                }}
                disabled={!isConnected || sendingCommand || !isStreaming}
                className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all relative group ${
                  isDisabled || !isStreaming
                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                    : isReady && usbStreamLastMeasurement?.rssi !== null && usbStreamLastMeasurement?.rssi !== undefined && usbStreamLastMeasurement.rssi !== -999
                    ? usbStreamLastMeasurement.rssi >= -70
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 cursor-pointer'
                      : usbStreamLastMeasurement.rssi >= -90
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-200 dark:hover:bg-yellow-900/50 cursor-pointer'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 cursor-pointer'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer'
                }`}
              >
                <span className="text-xl">📶</span>
                <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-50 w-72 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl border border-gray-700">
                  <p className="font-semibold mb-2">📶 Test réseau / RSSI</p>
                  <p className="text-left mb-2">
                    {modemStatus === 'running' 
                      ? 'Teste l\'enregistrement réseau et affiche le RSSI actuel.'
                      : 'Démarre le modem puis teste le réseau pour obtenir le RSSI.'}
                  </p>
                  <p className="text-left text-gray-400">
                    Le modem doit être démarré pour obtenir le RSSI. Les résultats s'affichent dans la console.
                  </p>
                </div>
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Signal RSSI</p>
                <p className={`text-sm font-semibold truncate ${
                  isDisabled
                    ? 'text-gray-400 dark:text-gray-500'
                    : isReady && usbStreamLastMeasurement?.rssi !== null && usbStreamLastMeasurement?.rssi !== undefined && usbStreamLastMeasurement.rssi !== -999
                    ? usbStreamLastMeasurement.rssi >= -70
                      ? 'text-green-600 dark:text-green-400'
                      : usbStreamLastMeasurement.rssi >= -90
                      ? 'text-yellow-600 dark:text-yellow-400'
                      : 'text-red-600 dark:text-red-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {isReady && usbStreamLastMeasurement?.rssi !== null && usbStreamLastMeasurement?.rssi !== undefined && usbStreamLastMeasurement.rssi !== -999
                    ? `${usbStreamLastMeasurement.rssi} dBm`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>

          {/* Section 4 : Statistiques et informations */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">ℹ️ Statistiques</h3>
            {/* Mesures reçues */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isDisabled ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400'}`}>
                <span className="text-xl">📊</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Mesures</p>
                <p className={`text-sm font-semibold truncate ${isDisabled ? 'text-gray-400 dark:text-gray-500' : 'text-indigo-600 dark:text-indigo-400'}`}>
                  {isReady ? (usbStreamMeasurements?.length || 0) : 0} reçues
                </p>
              </div>
            </div>

            {/* Dernière mise à jour */}
            <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                isDisabled
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                  : isReady && usbStreamLastUpdate && (currentTime - usbStreamLastUpdate) < 5000
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
              }`}>
                <span className="text-xl">🕐</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Dernière mesure</p>
                <p className={`text-sm font-semibold truncate ${
                  isDisabled
                    ? 'text-gray-400 dark:text-gray-500'
                    : isReady && usbStreamLastUpdate && (currentTime - usbStreamLastUpdate) < 5000
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-gray-400 dark:text-gray-500'
                }`}>
                  {isReady && usbStreamLastUpdate 
                    ? `${Math.floor((currentTime - usbStreamLastUpdate) / 1000)}s`
                    : 'Jamais'}
                </p>
              </div>
            </div>
          </div>
        </div>


        {/* Console de logs - logs récents en haut */}
        <div 
          className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-900 p-4 shadow-inner overflow-y-auto" 
          style={{ minHeight: '500px', maxHeight: '600px' }}
        >
          {usbStreamLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
              <span className="text-4xl">📡</span>
              <p className="font-medium">En attente de logs USB...</p>
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
  )
}
