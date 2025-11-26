'use client'

import { useState, useEffect } from 'react'
import { useUsb } from '@/contexts/UsbContext'
import { getUsbDeviceLabel } from '@/lib/usbDevices'

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
    stopUsbStreaming,
    appendUsbStreamLog
  } = useUsb()
  
  const [availablePorts, setAvailablePorts] = useState([])
  const [selectedPortId, setSelectedPortId] = useState('')
  const [loadingPorts, setLoadingPorts] = useState(false)
  const [isToggling, setIsToggling] = useState(false)

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
      console.error('[UsbStreamingTab] Erreur chargement ports:', err)
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
        console.error('[UsbStreamingTab] Erreur demande nouveau port:', err)
      }
    } else {
      setSelectedPortId(portId)
    }
  }

  // Toggle lecture/arrêt
  const handleToggleStreaming = async () => {
    if (isToggling) return
    
    setIsToggling(true)
    try {
      if (usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting') {
        // Arrêter
        stopUsbStreaming()
        if (isConnected) {
          await disconnect()
        }
      } else {
        // Démarrer
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
        
        // Attendre un peu pour que la connexion soit stable
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // Démarrer directement la lecture sans passer par startUsbStreaming
        // qui appelle ensurePortReady et peut ouvrir un modal
        // On va utiliser directement startReading avec handleUsbStreamChunk
        // Mais d'abord, il faut importer handleUsbStreamChunk depuis le contexte
        // En fait, on va simplifier en utilisant startUsbStreaming mais en s'assurant
        // que le port est déjà connecté pour éviter ensurePortReady
        
        // Vérifier que le port est bien connecté avant de démarrer
        if (!isConnected) {
          throw new Error('Port non connecté après connexion')
        }
        
        // Démarrer le streaming (startUsbStreaming vérifiera que le port est connecté)
        await startUsbStreaming()
      }
    } catch (err) {
      console.error('[UsbStreamingTab] Erreur toggle streaming:', err)
      alert(`Erreur: ${err.message || err}`)
    } finally {
      setIsToggling(false)
    }
  }

  const isStreaming = usbStreamStatus === 'running' || usbStreamStatus === 'waiting' || usbStreamStatus === 'connecting'
  const canToggle = isSupported && !isToggling && (selectedPortId || isStreaming)

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
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-primary-500 hover:bg-primary-600 text-white'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {isToggling ? (
                  '⏳...'
                ) : isStreaming ? (
                  '⏹️ Arrêter'
                ) : (
                  '▶️ Démarrer'
                )}
              </button>
            </div>
          </div>
        )}

        {/* Statut de connexion */}
        {isStreaming && (
          <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              🟢 Streaming actif
            </p>
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

        {/* Console de logs */}
        <div className="rounded-2xl border border-gray-200 dark:border-slate-700 bg-gray-900 text-green-400 p-4 shadow-inner overflow-y-auto" style={{ minHeight: '500px', maxHeight: '600px' }}>
          {usbStreamLogs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-2 text-gray-500">
              <span className="text-4xl">📡</span>
              <p className="font-medium">En attente de logs USB...</p>
            </div>
          ) : (
            <div className="space-y-1 font-mono text-sm tracking-tight">
              {usbStreamLogs.map((log) => (
                <div key={log.id} className="whitespace-pre-wrap">
                  <span className="text-gray-500 pr-3">{new Date(log.timestamp).toLocaleTimeString('fr-FR')}</span>
                  <span className="text-green-300">{log.line}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mesures en temps réel */}
        {usbStreamLastMeasurement && (
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Débit</p>
              <p className="text-2xl font-bold text-primary">
                {usbStreamLastMeasurement.flowrate !== null && usbStreamLastMeasurement.flowrate !== undefined
                  ? `${usbStreamLastMeasurement.flowrate.toFixed(2)} L/min`
                  : 'N/A'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Batterie</p>
              <p className="text-2xl font-bold text-primary">
                {usbStreamLastMeasurement.battery !== null && usbStreamLastMeasurement.battery !== undefined
                  ? `${usbStreamLastMeasurement.battery.toFixed(0)}%`
                  : 'N/A'}
              </p>
            </div>
            <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">RSSI</p>
              <p className="text-2xl font-bold text-primary">
                {usbStreamLastMeasurement.rssi !== null && usbStreamLastMeasurement.rssi !== undefined
                  ? `${usbStreamLastMeasurement.rssi} dBm`
                  : 'N/A'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
