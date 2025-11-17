'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useSerialPort } from '@/components/SerialPortManager'
import SerialTerminal from '@/components/SerialTerminal'
import DeviceAutotest from '@/components/DeviceAutotest'
import { ESPLoader } from 'esptool-js'

/**
 * Modal simplifié pour le flash USB
 * Réutilise les composants de device-flash mais dans un modal
 */
export default function FlashUSBModal({ isOpen, onClose, device }) {
  const { fetchWithAuth, API_URL } = useAuth()
  const [firmwares, setFirmwares] = useState([])
  const [selectedFirmware, setSelectedFirmware] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [flashing, setFlashing] = useState(false)
  const [flashProgress, setFlashProgress] = useState(0)
  const [terminalLogs, setTerminalLogs] = useState([])
  const stopReadingRef = useRef(null)

  // Gestion du port série
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
    }
  }, [isOpen, loadFirmwares])

  // Gérer la connexion
  const handleConnect = useCallback(async () => {
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
      }
    }
  }, [requestPort, connect, startReading])

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

    const response = await fetch(`${API_URL}/api.php/firmwares/${firmware.id}/download`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })

    if (!response.ok) throw new Error('Erreur téléchargement')
    return await response.blob()
  }, [API_URL])

  // Flasher
  const handleFlash = useCallback(async () => {
    if (!selectedFirmware || !isConnected || !port) {
      setError('Sélectionnez un firmware et connectez un port')
      return
    }

    setFlashing(true)
    setError(null)
    setFlashProgress(0)

    try {
      setFlashProgress(5)
      const firmwareBlob = await downloadFirmware(selectedFirmware)
      setFlashProgress(10)
      const firmwareArrayBuffer = await firmwareBlob.arrayBuffer()

      const terminal = {
        clean: () => {},
        writeLine: (data) => {
          setTerminalLogs(prev => [...prev, { raw: `[ESPTOOL] ${data}`, timestamp: new Date() }])
        },
        write: (data) => {
          setTerminalLogs(prev => {
            const lastLog = prev[prev.length - 1]
            if (lastLog && lastLog.raw && !lastLog.raw.endsWith('\n')) {
              return [...prev.slice(0, -1), { ...lastLog, raw: lastLog.raw + data }]
            }
            return [...prev, { raw: `[ESPTOOL] ${data}`, timestamp: new Date() }]
          })
        }
      }

      setFlashProgress(20)
      const loader = new ESPLoader(port, terminal, 115200)
      setFlashProgress(25)
      await loader.connect()
      setFlashProgress(30)

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
        await loader.verify(offset, firmwareData)
      }
      setFlashProgress(100)

      setTerminalLogs(prev => [...prev, { raw: '[ESPTOOL] ✅ Flash réussi !', timestamp: new Date() }])
    } catch (err) {
      setError(err.message)
      setTerminalLogs(prev => [...prev, { raw: `[ESPTOOL] ❌ Erreur: ${err.message}`, timestamp: new Date() }])
    } finally {
      setFlashing(false)
    }
  }, [selectedFirmware, isConnected, port, downloadFirmware])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 dark:bg-black/60 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">🔌 Flash USB</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {device ? `Dispositif: ${device.device_name || device.sim_iccid}` : 'Flasher un dispositif via USB'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Colonne gauche */}
            <div className="space-y-4">
              {/* Port série */}
              <div className="card">
                <h3 className="font-semibold mb-3">📡 Port série</h3>
                {!isConnected ? (
                  <button
                    onClick={handleConnect}
                    disabled={!isSupported || flashing}
                    className="btn-primary w-full"
                  >
                    🔌 Sélectionner un port
                  </button>
                ) : (
                  <div className="space-y-2">
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3">
                      <p className="text-sm font-semibold text-green-800 dark:text-green-300">● Connecté</p>
                    </div>
                    <button onClick={handleDisconnect} disabled={flashing} className="btn-secondary w-full text-sm">
                      Déconnecter
                    </button>
                  </div>
                )}
              </div>

              {/* Firmware */}
              <div className="card">
                <h3 className="font-semibold mb-3">📦 Firmware</h3>
                {loading ? (
                  <p className="text-sm text-gray-500">Chargement...</p>
                ) : (
                  <div className="space-y-2">
                    {firmwares.map((fw) => (
                      <div
                        key={fw.id}
                        onClick={() => setSelectedFirmware(fw)}
                        className={`p-2 rounded border-2 cursor-pointer ${
                          selectedFirmware?.id === fw.id
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      >
                        <p className="font-mono text-sm">v{fw.version}</p>
                        <p className="text-xs text-gray-500">{fw.is_stable ? '✅ Stable' : '⚠️ Beta'}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bouton flash */}
              {isConnected && selectedFirmware && (
                <div className="card">
                  <button
                    onClick={handleFlash}
                    disabled={flashing}
                    className="btn-primary w-full"
                  >
                    {flashing ? `⏳ Flash... ${flashProgress}%` : `🚀 Flasher v${selectedFirmware.version}`}
                  </button>
                  {flashing && (
                    <div className="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className="bg-primary-500 h-2 rounded-full transition-all"
                        style={{ width: `${flashProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Colonne droite */}
            <div className="space-y-4">
              <SerialTerminal
                isConnected={isConnected}
                onRead={(onData) => startReading(onData)}
                onWrite={write}
                autoScroll={true}
              />
              <DeviceAutotest
                isConnected={isConnected}
                logs={terminalLogs}
              />
            </div>
          </div>

          {(error || serialError) && (
            <div className="mt-4 alert alert-warning">
              {error || serialError}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

