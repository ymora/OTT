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
    usbStreamLogs,
    usbStreamError,
    usbStreamLastMeasurement,
    requestPort,
    connect,
    disconnect,
    startReading,
    write,
    startUsbStreaming,
    pauseUsbStreaming,
    stopUsbStreaming,
    appendUsbStreamLog
  } = useUsb()
  
  const [availablePorts, setAvailablePorts] = useState([])
  const [selectedPortId, setSelectedPortId] = useState('')
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [isToggling, setIsToggling] = useState(false)
  
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
        
        // RSSI
        if (usbStreamLastMeasurement.rssi !== null && usbStreamLastMeasurement.rssi !== undefined) {
          if (newValues.rssi.min === null || usbStreamLastMeasurement.rssi < newValues.rssi.min) {
            newValues.rssi.min = usbStreamLastMeasurement.rssi
          }
          if (newValues.rssi.max === null || usbStreamLastMeasurement.rssi > newValues.rssi.max) {
            newValues.rssi.max = usbStreamLastMeasurement.rssi
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

        {/* Mesures en temps réel - Au-dessus de la console */}
        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Débit</p>
            <p className="text-2xl font-bold text-primary">
              {usbStreamLastMeasurement?.flowrate !== null && usbStreamLastMeasurement?.flowrate !== undefined
                ? `${usbStreamLastMeasurement.flowrate.toFixed(2)} L/min`
                : '0.00 L/min'}
            </p>
            {(minMaxValues.flowrate.min !== null || minMaxValues.flowrate.max !== null) && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Min: {minMaxValues.flowrate.min !== null ? `${minMaxValues.flowrate.min.toFixed(2)}` : '-'} | 
                Max: {minMaxValues.flowrate.max !== null ? `${minMaxValues.flowrate.max.toFixed(2)}` : '-'} L/min
              </p>
            )}
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Batterie</p>
            <p className="text-2xl font-bold text-primary">
              {usbStreamLastMeasurement?.battery !== null && usbStreamLastMeasurement?.battery !== undefined
                ? `${usbStreamLastMeasurement.battery.toFixed(0)}%`
                : '0%'}
            </p>
            {(minMaxValues.battery.min !== null || minMaxValues.battery.max !== null) && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Min: {minMaxValues.battery.min !== null ? `${minMaxValues.battery.min.toFixed(0)}` : '-'} | 
                Max: {minMaxValues.battery.max !== null ? `${minMaxValues.battery.max.toFixed(0)}` : '-'}%
              </p>
            )}
          </div>
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 relative group">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase">RSSI</p>
              <div className="relative">
                <button 
                  type="button"
                  className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 cursor-help transition-colors"
                  title="Cliquez pour plus d'infos"
                >
                  ℹ️
                </button>
                <div className="absolute left-0 bottom-full mb-2 w-72 p-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20 pointer-events-none">
                  <div className="absolute bottom-0 left-4 transform translate-y-full">
                    <div className="border-4 border-transparent border-t-blue-200 dark:border-t-blue-800"></div>
                  </div>
                  <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-1">
                    <span>📡</span>
                    <span>RSSI (Received Signal Strength Indicator)</span>
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
                    Mesure la <strong>force du signal réseau cellulaire</strong> entre le dispositif et l&apos;antenne la plus proche.
                  </p>
                  <div className="text-xs text-gray-600 dark:text-gray-300 space-y-1">
                    <p className="font-semibold mb-1">Valeurs typiques :</p>
                    <div className="space-y-0.5">
                      <div>• <strong className="text-green-600 dark:text-green-400">-50 à -70 dBm</strong> : Excellent signal ⭐⭐⭐</div>
                      <div>• <strong className="text-blue-600 dark:text-blue-400">-70 à -90 dBm</strong> : Bon signal ⭐⭐</div>
                      <div>• <strong className="text-yellow-600 dark:text-yellow-400">-90 à -110 dBm</strong> : Signal faible ⭐</div>
                      <div>• <strong className="text-red-600 dark:text-red-400">-110 à -150 dBm</strong> : Signal très faible ⚠️</div>
                      <div>• <strong className="text-gray-600 dark:text-gray-400">-999 dBm</strong> : Pas de signal ou erreur</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <p className="text-2xl font-bold text-primary">
              {usbStreamLastMeasurement?.rssi !== null && usbStreamLastMeasurement?.rssi !== undefined
                ? `${usbStreamLastMeasurement.rssi} dBm`
                : '-999 dBm'}
            </p>
            {(minMaxValues.rssi.min !== null || minMaxValues.rssi.max !== null) && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Min: {minMaxValues.rssi.min !== null ? `${minMaxValues.rssi.min}` : '-'} | 
                Max: {minMaxValues.rssi.max !== null ? `${minMaxValues.rssi.max}` : '-'} dBm
              </p>
            )}
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
