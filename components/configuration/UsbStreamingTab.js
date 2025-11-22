'use client'

import { useUsb } from '@/contexts/UsbContext'

export default function UsbStreamingTab() {
  const {
    usbConnectedDevice,
    usbVirtualDevice,
    usbPortInfo,
    isSupported,
    usbStreamStatus,
    usbStreamLogs,
    usbStreamError,
    usbStreamLastMeasurement,
    startUsbStreaming,
    stopUsbStreaming
  } = useUsb()

  const getUsbStreamStatusBadge = () => {
    switch (usbStreamStatus) {
      case 'running':
        return { label: '🟢 En cours', color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' }
      case 'waiting':
        return { label: '🟡 En attente', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' }
      case 'connecting':
        return { label: '🔵 Connexion...', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' }
      case 'idle':
      default:
        return { label: '⚪ Arrêté', color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' }
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-semibold">📡 Streaming USB</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Visualisation en temps réel des logs USB du dispositif connecté
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getUsbStreamStatusBadge().color}`}>
              {getUsbStreamStatusBadge().label}
            </span>
            {(usbStreamStatus === 'running' || usbStreamStatus === 'waiting') && (
              <button
                onClick={stopUsbStreaming}
                disabled={!isSupported}
                className="btn-secondary text-sm"
              >
                ⏹️ Arrêter
              </button>
            )}
            {usbStreamStatus === 'idle' && (usbConnectedDevice || usbVirtualDevice) && (
              <button
                onClick={startUsbStreaming}
                disabled={!isSupported || usbStreamStatus === 'connecting'}
                className={`btn-primary text-sm ${(!isSupported || usbStreamStatus === 'connecting') ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                ▶️ Démarrer
              </button>
            )}
          </div>
        </div>

        {!isSupported && (
          <div className="alert alert-warning mb-4">
            Le navigateur utilisé ne supporte pas l&apos;API Web Serial. Utilisez Chrome ou Edge (desktop) pour accéder au streaming USB.
          </div>
        )}

        {usbStreamError && (
          <div className="alert alert-warning mb-4">
            {usbStreamError}
          </div>
        )}

        {usbPortInfo && (
          <div className="mb-4 rounded-xl border border-gray-200/80 dark:border-slate-700/60 bg-white/60 dark:bg-slate-900/40 px-4 py-3 text-sm text-gray-700 dark:text-slate-200">
            <p className="font-semibold text-primary-600 dark:text-primary-300">
              Port USB détecté : {usbPortInfo.friendlyName || `USB ${usbPortInfo.vendorHex}:${usbPortInfo.productHex}`}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              VID {usbPortInfo.vendorHex} · PID {usbPortInfo.productHex}
            </p>
          </div>
        )}

        {isSupported && !usbConnectedDevice && !usbVirtualDevice && (
          <div className="alert alert-info text-sm mb-4">
            Connectez un dispositif USB et autorisez-le dans la popup du navigateur. Le streaming démarrera automatiquement.
          </div>
        )}

        {(usbVirtualDevice || usbConnectedDevice) && (
          <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            <p className="font-semibold text-blue-800 dark:text-blue-300">
              Dispositif : {usbConnectedDevice?.device_name || usbVirtualDevice?.device_name || 'Inconnu'}
            </p>
            {usbConnectedDevice?.sim_iccid && (
              <p className="text-sm text-blue-600 dark:text-blue-400 font-mono">
                ICCID: {usbConnectedDevice.sim_iccid}
              </p>
            )}
            {usbVirtualDevice?.isVirtual && (
              <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">
                ⚠️ Dispositif virtuel (non enregistré en base)
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

