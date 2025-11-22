'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useUsb } from '@/contexts/UsbContext'
import { useSerialPort } from '@/components/SerialPortManager'
import SerialTerminal from '@/components/SerialTerminal'
import DeviceAutotest from '@/components/DeviceAutotest'
import { ESPLoader } from 'esptool-js'
import logger from '@/lib/logger'

/**
 * Modal simplifié pour le flash USB
 * Réutilise les composants de device-flash mais dans un modal
 */
export default function FlashUSBModal({ isOpen, onClose, device, preselectedFirmwareVersion = null }) {
  const { fetchWithAuth, API_URL } = useAuth()
  const [firmwares, setFirmwares] = useState([])
  const [selectedFirmware, setSelectedFirmware] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [flashing, setFlashing] = useState(false)
  const [flashProgress, setFlashProgress] = useState(0)
  const [terminalLogs, setTerminalLogs] = useState([])
  const [flashComplete, setFlashComplete] = useState(false)
  const [deviceAlive, setDeviceAlive] = useState(null) // null = pas testé, true = vivant, false = mort
  const stopReadingRef = useRef(null)

  // Utiliser le contexte USB partagé pour éviter les conflits de port
  const {
    port: usbPort,
    isConnected: usbIsConnected,
    isSupported: usbIsSupported,
    stopUsbStreaming
  } = useUsb()

  // Gestion du port série (instance séparée pour le flash)
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

  // Déconnecter le streaming USB de la page dispositifs quand on ouvre le modal
  useEffect(() => {
    if (isOpen && usbIsConnected && stopUsbStreaming) {
      logger.log('🔄 Arrêt du streaming USB pour libérer le port pour le flash')
      stopUsbStreaming()
    }
  }, [isOpen, usbIsConnected, stopUsbStreaming])

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

  // Fonction pour rafraîchir les données après mise à jour (appelée depuis le parent si nécessaire)
  const refreshDevices = useCallback(async () => {
    try {
      // Recharger les dispositifs depuis l'API pour rafraîchir l'affichage
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

  // Charger au montage et pré-sélectionner le firmware si fourni
  useEffect(() => {
    if (isOpen) {
      loadFirmwares()
    }
  }, [isOpen, loadFirmwares])

  // Pré-sélectionner le firmware si fourni
  useEffect(() => {
    if (preselectedFirmwareVersion && firmwares.length > 0) {
      const firmware = firmwares.find(fw => fw.version === preselectedFirmwareVersion)
      if (firmware) {
        setSelectedFirmware(firmware)
      }
    }
  }, [preselectedFirmwareVersion, firmwares])

  // Gérer la connexion
  const handleConnect = useCallback(async () => {
    try {
      // S'assurer que le streaming USB est arrêté
      if (stopUsbStreaming) {
        stopUsbStreaming()
        await new Promise(resolve => setTimeout(resolve, 500)) // Attendre un peu que le port soit libéré
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
      setError(`Erreur de connexion: ${err.message}. Le port est peut-être déjà utilisé. Déconnectez d'abord depuis la page dispositifs.`)
    }
  }, [requestPort, connect, startReading, stopUsbStreaming, serialError])

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
      setFlashComplete(true)

      setTerminalLogs(prev => [...prev, { raw: '[ESPTOOL] ✅ Flash réussi !', timestamp: new Date() }])
      
      // Mettre à jour la version firmware dans la base de données si un dispositif est associé
      if (device && device.id && selectedFirmware) {
        try {
          setTerminalLogs(prev => [...prev, { raw: `[UPDATE] Mise à jour version firmware dans la base...`, timestamp: new Date() }])
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
          setTerminalLogs(prev => [...prev, { raw: `[UPDATE] ✅ Version firmware mise à jour: v${selectedFirmware.version}`, timestamp: new Date() }])
          logger.log('✅ Version firmware mise à jour après flash:', selectedFirmware.version)
          // Rafraîchir les données pour que la page dispositifs affiche la nouvelle version
          await refreshDevices()
        } catch (updateErr) {
          logger.warn('⚠️ Erreur mise à jour version firmware:', updateErr)
          setTerminalLogs(prev => [...prev, { raw: `[UPDATE] ⚠️ Erreur mise à jour: ${updateErr.message}`, timestamp: new Date() }])
        }
      } else if (device && !device.id && selectedFirmware) {
        // Dispositif virtuel (non enregistré) - juste logger
        setTerminalLogs(prev => [...prev, { raw: `[UPDATE] ℹ️ Dispositif non enregistré - version sera mise à jour lors de la prochaine connexion`, timestamp: new Date() }])
      }
      
      // Vérifier si le dispositif est vivant après le flash
      setTerminalLogs(prev => [...prev, { raw: '[TEST] Attente redémarrage (3 secondes)...', timestamp: new Date() }])
      await new Promise(resolve => setTimeout(resolve, 3000)) // Attendre 3s que le dispositif redémarre
      
      try {
        setTerminalLogs(prev => [...prev, { raw: '[TEST] Envoi commande AT pour vérifier...', timestamp: new Date() }])
        
        // Envoyer une commande AT pour vérifier que le dispositif répond
        await write('AT\r\n')
        
        // Attendre une réponse (le dispositif devrait envoyer device_info ou répondre à AT)
        let hasResponse = false
        const responseCheck = setInterval(() => {
          setTerminalLogs(prev => {
            const recentLogs = prev.slice(-10)
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
              return [...prev, { raw: '[TEST] ✅ Dispositif répond !', timestamp: new Date() }]
            }
            return prev
          })
        }, 500)
        
        // Timeout après 5 secondes
        setTimeout(() => {
          clearInterval(responseCheck)
          if (!hasResponse) {
            setDeviceAlive(false)
            setTerminalLogs(prev => [...prev, { raw: '[TEST] ⚠️ Pas de réponse détectée (peut être normal si le dispositif redémarre encore)', timestamp: new Date() }])
          }
        }, 5000)
      } catch (testErr) {
        setTerminalLogs(prev => [...prev, { raw: `[TEST] ⚠️ Erreur test: ${testErr.message}`, timestamp: new Date() }])
      }
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
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">🔌 Flash USB</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {device ? `${device.device_name || device.sim_iccid}` : 'Flasher un dispositif'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xl">
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Sélection firmware et port */}
          <div className="grid grid-cols-2 gap-4">
            {/* Port série */}
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

            {/* Firmware */}
            <div>
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
                  {firmwares.map((fw) => (
                    <option key={fw.id} value={fw.id}>
                      v{fw.version} {fw.is_stable ? '✅' : '⚠️'}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Bouton flash */}
          {isConnected && selectedFirmware && (
            <div>
              <button
                onClick={handleFlash}
                disabled={flashing}
                className="btn-primary w-full"
              >
                {flashing ? `⏳ Flash en cours... ${flashProgress}%` : `🚀 Flasher v${selectedFirmware.version}`}
              </button>
              
              {/* Barre de progression */}
              {flashing && (
                <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className="bg-primary-500 h-3 rounded-full transition-all duration-300"
                    style={{ width: `${flashProgress}%` }}
                  />
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
                      <p className="text-yellow-800 dark:text-yellow-300 font-semibold">⚠️ Pas de réponse détectée (peut être normal si redémarrage)</p>
                    </div>
                  )}
                  {deviceAlive === null && (
                    <div className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                      <p className="text-blue-800 dark:text-blue-300 font-semibold">⏳ Vérification en cours...</p>
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

