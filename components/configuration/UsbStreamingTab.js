'use client'

import { useState, useEffect, useRef } from 'react'
import { useUsb } from '@/contexts/UsbContext'
import { getUsbDeviceLabel } from '@/lib/usbDevices'
import logger from '@/lib/logger'

export default function UsbStreamingTab() {
  const {
    usbConnectedDevice,
    usbVirtualDevice,
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
      
      // Si aucun port sélectionné mais qu'on est connecté, sélectionner le port actuel
      if (!selectedPortId && port && portsList.length > 0) {
        const currentPortIndex = ports.findIndex(p => p === port)
        if (currentPortIndex >= 0) {
          setSelectedPortId(portsList[currentPortIndex].id)
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
  }, [isSupported, selectedPortId, port])

  // Gérer la sélection d'un port
  const handlePortSelect = async (portId) => {
    if (portId === 'new') {
      // Demander un nouveau port
      try {
        const newPort = await requestPort()
        if (newPort) {
          await loadAvailablePorts()
          // Sélectionner le nouveau port
          const ports = await navigator.serial.getPorts()
          const newPortIndex = ports.findIndex(p => p === newPort)
          if (newPortIndex >= 0) {
            setSelectedPortId(`port-${newPortIndex}`)
          }
        }
      } catch (err) {
        logger.error('[UsbStreamingTab] Erreur demande nouveau port:', err)
      }
    } else {
      setSelectedPortId(portId)
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
        if (!selectedPortId) {
          alert('Veuillez sélectionner un port USB')
          setIsToggling(false)
          return
        }
        
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
        
        // Vérifier directement si le port est ouvert plutôt que de compter sur isConnected
        // qui peut ne pas être mis à jour immédiatement
        const portIsOpen = selectedPortData.port.readable && selectedPortData.port.writable
        
        if (!portIsOpen) {
          throw new Error('Port non ouvert après connect() - vérifiez que le port est bien connecté')
        }
        
        // Passer explicitement le port à startUsbStreaming pour éviter les problèmes
        // de state React qui n'est pas encore mis à jour
        await startUsbStreaming(selectedPortData.port)
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
    if (!isConnected || !port || sendingCommand) return
    
    setSendingCommand(true)
    try {
      const encoder = new TextEncoder()
      const data = encoder.encode(command + '\n')
      await write(data)
      logger.log(`[USB] Commande envoyée: ${command}`)
    } catch (err) {
      logger.error('[USB] Erreur envoi commande:', err)
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

  const isStreaming = usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting'
  const isPaused = usbStreamStatus === 'paused'
  const canToggle = isSupported && !isToggling && (selectedPortId || isStreaming || isPaused)

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">📡 Streaming USB</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Visualisation en temps réel des logs USB du dispositif connecté
          </p>
        </div>

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

        {isSupported && (
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {/* Menu déroulant pour sélectionner le port */}
            <div className="flex-1">
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
                  {loadingPorts ? 'Chargement...' : availablePorts.length === 0 ? 'Aucun port autorisé' : 'Sélectionner un port'}
                </option>
                {availablePorts.map((portData) => (
                  <option key={portData.id} value={portData.id}>
                    {portData.label}
                  </option>
                ))}
                <option value="new">➕ Autoriser un nouveau port...</option>
              </select>
            </div>

            {/* Bouton toggle Démarrer/Arrêter */}
            <div className="flex items-end">
              <button
                onClick={handleToggleStreaming}
                disabled={!canToggle}
                className={`px-6 py-2 rounded-lg font-semibold text-sm transition-colors ${
                  isStreaming
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    : isPaused
                    ? 'bg-primary-500 hover:bg-primary-600 text-white'
                    : 'bg-primary-500 hover:bg-primary-600 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isToggling ? (
                  '⏳...'
                ) : isStreaming ? (
                  '⏸️ Pause'
                ) : isPaused ? (
                  '▶️ Reprendre'
                ) : (
                  '▶️ Démarrer'
                )}
              </button>
            </div>
          </div>
        )}


        {/* Info dispositif */}
        {(usbVirtualDevice || usbConnectedDevice) && (
          <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
              Dispositif : {usbConnectedDevice?.device_name || usbVirtualDevice?.device_name || 'Inconnu'}
            </p>
            {usbConnectedDevice?.sim_iccid && (
              <p className="text-xs text-blue-600 dark:text-blue-400 font-mono mt-1">
                ICCID: {usbConnectedDevice.sim_iccid}
              </p>
            )}
          </div>
        )}

        {/* Contrôles modem et GPS */}
        {isStreaming && (
          <div className="mb-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">🔧 Contrôles modem et GPS</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <button
                onClick={handleModemOn}
                disabled={!isConnected || sendingCommand || modemStatus === 'running' || modemStatus === 'starting'}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-green-500 hover:bg-green-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Démarrer le modem pour tester le réseau et le GPS"
              >
                {modemStatus === 'starting' ? '⏳...' : '📡 Démarrer modem'}
              </button>
              <button
                onClick={handleModemOff}
                disabled={!isConnected || sendingCommand || modemStatus === 'stopped' || modemStatus === 'stopping'}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-red-500 hover:bg-red-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Arrêter le modem pour économiser l'énergie"
              >
                {modemStatus === 'stopping' ? '⏳...' : '🛑 Arrêter modem'}
              </button>
              <button
                onClick={handleTestNetwork}
                disabled={!isConnected || sendingCommand || modemStatus !== 'running'}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Tester l'enregistrement réseau (nécessite modem démarré)"
              >
                📶 Test réseau
              </button>
              <button
                onClick={handleTestGps}
                disabled={!isConnected || sendingCommand || modemStatus !== 'running'}
                className="px-3 py-2 text-xs font-medium rounded-lg bg-purple-500 hover:bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Tester le GPS (nécessite modem démarré)"
              >
                📍 Test GPS
              </button>
            </div>
            <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded text-xs text-blue-800 dark:text-blue-300">
              <p className="font-semibold mb-1">📋 Comment utiliser :</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>Cliquez sur <strong>"📡 Démarrer modem"</strong> pour démarrer le modem</li>
                <li>Attendez que l'indicateur Modem passe à <strong>"Démarré"</strong> (vert)</li>
                <li>Cliquez sur <strong>"📶 Test réseau"</strong> pour tester l'enregistrement Free</li>
                <li>Cliquez sur <strong>"📍 Test GPS"</strong> pour tester le GPS</li>
                <li>Les logs s'affichent dans la console en bas de page</li>
              </ol>
            </div>
          </div>
        )}

        {/* Indicateurs d'état */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* État connexion USB */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isConnected 
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' 
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              <span className="text-xl">{isConnected ? '🔌' : '🔌'}</span>
            </div>
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

          {/* État streaming */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              usbStreamStatus === 'running'
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : usbStreamStatus === 'paused'
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                : usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting'
                ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              <span className="text-xl">
                {usbStreamStatus === 'running' ? '▶️' : 
                 usbStreamStatus === 'paused' ? '⏸️' : 
                 usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting' ? '⏳' : '⏹️'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Streaming</p>
              <p className={`text-sm font-semibold truncate ${
                usbStreamStatus === 'running'
                  ? 'text-blue-600 dark:text-blue-400'
                  : usbStreamStatus === 'paused'
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : usbStreamStatus === 'connecting' || usbStreamStatus === 'waiting'
                  ? 'text-purple-600 dark:text-purple-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {usbStreamStatus === 'running' ? 'En cours' : 
                 usbStreamStatus === 'paused' ? 'En pause' : 
                 usbStreamStatus === 'connecting' ? 'Connexion...' : 
                 usbStreamStatus === 'waiting' ? 'En attente...' : 
                 'Arrêté'}
              </p>
            </div>
          </div>

          {/* État modem */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              modemStatus === 'running'
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : modemStatus === 'starting' || modemStatus === 'stopping'
                ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              <span className="text-xl">📡</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Modem</p>
              <p className={`text-sm font-semibold truncate ${
                modemStatus === 'running'
                  ? 'text-green-600 dark:text-green-400'
                  : modemStatus === 'starting' || modemStatus === 'stopping'
                  ? 'text-yellow-600 dark:text-yellow-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {modemStatus === 'running' ? 'Démarré' : 
                 modemStatus === 'starting' ? 'Démarrage...' : 
                 modemStatus === 'stopping' ? 'Arrêt...' : 
                 'Arrêté'}
              </p>
            </div>
          </div>

          {/* État GPS */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              usbStreamLastMeasurement?.latitude && usbStreamLastMeasurement?.longitude
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              <span className="text-xl">📍</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Position GPS</p>
              <p className={`text-sm font-semibold truncate ${
                usbStreamLastMeasurement?.latitude && usbStreamLastMeasurement?.longitude
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {usbStreamLastMeasurement?.latitude && usbStreamLastMeasurement?.longitude
                  ? `${usbStreamLastMeasurement.latitude.toFixed(6)}, ${usbStreamLastMeasurement.longitude.toFixed(6)}`
                  : 'Non disponible'}
              </p>
            </div>
          </div>
        </div>

        {/* Indicateurs supplémentaires (2ème ligne) */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Débit */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <span className="text-xl">💨</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Débit</p>
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 truncate">
              {usbStreamLastMeasurement?.flowrate !== null && usbStreamLastMeasurement?.flowrate !== undefined
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
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              usbStreamLastMeasurement?.battery !== null && usbStreamLastMeasurement?.battery !== undefined
                ? usbStreamLastMeasurement.battery >= 50
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : usbStreamLastMeasurement.battery >= 20
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              <span className="text-xl">🔋</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Batterie</p>
              <p className={`text-sm font-semibold truncate ${
                usbStreamLastMeasurement?.battery !== null && usbStreamLastMeasurement?.battery !== undefined
                  ? usbStreamLastMeasurement.battery >= 50
                    ? 'text-green-600 dark:text-green-400'
                    : usbStreamLastMeasurement.battery >= 20
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
              {usbStreamLastMeasurement?.battery !== null && usbStreamLastMeasurement?.battery !== undefined
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
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              usbStreamLastMeasurement?.rssi !== null && usbStreamLastMeasurement?.rssi !== undefined && usbStreamLastMeasurement.rssi !== -999
                ? usbStreamLastMeasurement.rssi >= -70
                  ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                  : usbStreamLastMeasurement.rssi >= -90
                  ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400'
                  : 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              <span className="text-xl">📶</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Signal RSSI</p>
              <p className={`text-sm font-semibold truncate ${
                usbStreamLastMeasurement?.rssi !== null && usbStreamLastMeasurement?.rssi !== undefined && usbStreamLastMeasurement.rssi !== -999
                  ? usbStreamLastMeasurement.rssi >= -70
                    ? 'text-green-600 dark:text-green-400'
                    : usbStreamLastMeasurement.rssi >= -90
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {usbStreamLastMeasurement?.rssi !== null && usbStreamLastMeasurement?.rssi !== undefined && usbStreamLastMeasurement.rssi !== -999
                  ? `${usbStreamLastMeasurement.rssi} dBm`
                  : 'N/A'}
              </p>
            </div>
          </div>

          {/* Statistiques mesures */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
              <span className="text-xl">📊</span>
                  </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Mesures</p>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 truncate">
                {usbStreamMeasurements?.length || 0} reçues
              </p>
            </div>
          </div>

          {/* Dernière mise à jour */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              usbStreamLastUpdate && (Date.now() - usbStreamLastUpdate) < 5000
                ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
            }`}>
              <span className="text-xl">🕐</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Dernière MAJ</p>
              <p className={`text-sm font-semibold truncate ${
                usbStreamLastUpdate && (Date.now() - usbStreamLastUpdate) < 5000
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {usbStreamLastUpdate 
                  ? `${Math.floor((Date.now() - usbStreamLastUpdate) / 1000)}s`
                  : 'Jamais'}
              </p>
                    </div>
                  </div>

          {/* Version firmware */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400">
              <span className="text-xl">💾</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Firmware</p>
              <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 truncate font-mono">
                {usbStreamLastMeasurement?.raw?.firmware_version || 
                 usbVirtualDevice?.firmware_version || 
                 usbConnectedDevice?.firmware_version || 
                 'N/A'}
              </p>
                </div>
              </div>

          {/* ICCID/Serial */}
          <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
              <span className="text-xl">🆔</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-0.5">Identifiant</p>
              <p className="text-sm font-semibold text-orange-600 dark:text-orange-400 truncate font-mono">
                {(usbConnectedDevice?.sim_iccid || usbVirtualDevice?.sim_iccid || 
                  usbConnectedDevice?.device_serial || usbVirtualDevice?.device_serial)?.slice(-8) || 'N/A'}
              </p>
            </div>
          </div>
        </div>


        {/* Console de logs - logs récents en haut */}
        <div 
          className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-900 text-green-400 p-4 shadow-inner overflow-y-auto" 
          style={{ minHeight: '500px', maxHeight: '600px' }}
        >
          {usbStreamLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
              <span className="text-4xl">📡</span>
              <p className="font-medium">En attente de logs USB...</p>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-sm tracking-tight">
              {[...usbStreamLogs].reverse().map((log) => (
                <div key={log.id} className="whitespace-pre-wrap">
                  <span className="text-gray-500 pr-3">{new Date(log.timestamp).toLocaleTimeString('fr-FR')}</span>
                  <span className="text-green-300">{log.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
