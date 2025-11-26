'use client'

import { useState, useEffect, useRef } from 'react'
import { useUsb } from '@/contexts/UsbContext'

export default function UsbStreamingTab() {
  const {
    usbConnectedDevice,
    usbVirtualDevice,
    usbPortInfo,
    isSupported,
    isConnected,
    port,
    usbStreamStatus,
    usbStreamLogs,
    usbStreamError,
    usbStreamLastMeasurement,
    requestPort,
    connect,
    startUsbStreaming,
    stopUsbStreaming
  } = useUsb()
  const [isRequestingPort, setIsRequestingPort] = useState(false)
  const [requestStatus, setRequestStatus] = useState('')
  const autoConnectAttemptedRef = useRef(false)

  // Détection et connexion automatique au chargement de l'onglet
  useEffect(() => {
    // Ne faire qu'une seule tentative de connexion automatique
    if (autoConnectAttemptedRef.current) return
    if (!isSupported) return
    if (usbStreamStatus === 'running' || usbStreamStatus === 'connecting') return
    
    autoConnectAttemptedRef.current = true
    
    const autoConnect = async () => {
      try {
        // Vérifier les ports déjà autorisés
        const authorizedPorts = await navigator.serial.getPorts()
        
        if (authorizedPorts.length > 0) {
          // Utiliser le premier port autorisé
          const firstPort = authorizedPorts[0]
          const info = firstPort.getInfo?.()
          const label = info
            ? `VID ${info.usbVendorId?.toString(16).padStart(4, '0')} · PID ${info.usbProductId?.toString(16).padStart(4, '0')}`
            : 'Port autorisé'
          
          setRequestStatus(`🔍 Port USB déjà autorisé détecté (${label}). Connexion automatique...`)
          
          // Se connecter automatiquement
          const connected = await connect(firstPort, 115200)
          if (connected) {
            setRequestStatus(`✅ Port USB connecté (${label}). Démarrage automatique du streaming...`)
            // Démarrer le streaming automatiquement
            await startUsbStreaming()
            setRequestStatus(`✅ Streaming USB démarré automatiquement (${label})`)
            // Effacer le message après 3 secondes
            setTimeout(() => setRequestStatus(''), 3000)
          } else {
            setRequestStatus(`⚠️ Port détecté mais connexion échouée. Cliquez sur "🔍 Détecter USB" pour réessayer.`)
          }
        } else {
          // Aucun port autorisé, afficher un message informatif
          setRequestStatus('ℹ️ Aucun port USB autorisé. Cliquez sur "🔍 Détecter USB" pour autoriser un port.')
        }
      } catch (err) {
        console.error('[UsbStreamingTab] Erreur connexion automatique:', err)
        setRequestStatus(`⚠️ Erreur lors de la détection automatique: ${err.message || err}`)
      }
    }
    
    // Attendre un peu pour que le composant soit complètement monté
    const timeout = setTimeout(autoConnect, 500)
    
    return () => clearTimeout(timeout)
  }, [isSupported, usbStreamStatus, connect, startUsbStreaming])

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
              <p className="text-xs text-gray-400">
                Dès que le firmware envoie le flux USB, les journaux apparaissent ici automatiquement.
              </p>
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

