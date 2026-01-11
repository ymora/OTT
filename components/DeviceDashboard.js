/**
 * Tableau de bord unifié pour dispositifs USB
 * Version simplifiée et cohérente
 * @module components/DeviceDashboard
 * @returns {JSX.Element} Le composant DeviceDashboard
 */

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData, useSmartDeviceRefresh } from '@/hooks'
import { isArchived } from '@/lib/utils'
import logger from '@/lib/logger'
import Modal from '@/components/Modal'
import ConfirmModal from '@/components/ConfirmModal'
import SuccessMessage from '@/components/SuccessMessage'

/**
 * Composant principal du tableau de bord des dispositifs
 * @returns {JSX.Element} Le composant DeviceDashboard
 */
export default function DeviceDashboard() {
  const { fetchWithAuth, API_URL, user } = useAuth()
  
  // États
  const [showArchived, setShowArchived] = useState(false)
  const [successMessage, setSuccessMessage] = useState(null)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showUnassignModal, setShowUnassignModal] = useState(false)
  const [showFlashModal, setShowFlashModal] = useState(false)
  
  // USB Connection simplifiée
  const [isConnected, setIsConnected] = useState(false)
  const [logs, setLogs] = useState([])
  const [port, setPort] = useState(null)
  const readerRef = useRef(null)
  const writerRef = useRef(null)

  // Données
  const { data: devicesData, loading: devicesLoading, refetch: refetchDevices } = useApiData(
    showArchived ? '/api.php/devices?include_deleted=true' : '/api.php/devices',
    { requiresAuth: true, autoLoad: !!user, cacheTTL: 5000 }
  )
  
  const { data: patientsData } = useApiData(
    ['/api.php/patients'],
    { requiresAuth: true, autoLoad: !!user }
  )
  
  const { data: firmwaresData } = useApiData(
    ['/api.php/firmwares'],
    { requiresAuth: true, autoLoad: !!user }
  )

  const allDevices = devicesData?.devices?.devices || []
  const allPatients = patientsData?.patients?.patients || []
  const compiledFirmwares = (firmwaresData?.firmwares?.firmwares || []).filter(fw => fw.status === 'compiled')
  const devicesToDisplay = showArchived ? 
    allDevices.filter(d => isArchived(d)) : 
    allDevices.filter(d => !isArchived(d))

  // Rafraîchissement intelligent
  useSmartDeviceRefresh(refetchDevices, {
    isUsbConnected: isConnected,
    enabled: !!user,
    pollingIntervalUsb: 10000, // 10 secondes si USB connecté
    pollingIntervalWeb: 30000, // 30 secondes si web seulement
    eventDebounceMs: 2000
  })

  // Helper logs USB
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = `[${timestamp}] ${message}`
    console.log(logEntry)
    setLogs(prev => [...prev, { message: logEntry, type, timestamp: Date.now() }])
  }, [])

  // Connexion USB simplifiée
  const connectUsb = useCallback(async () => {
    if (!('serial' in navigator)) {
      addLog('❌ Web Serial API non supportée. Utilisez Chrome ou Edge.', 'error')
      return false
    }

    try {
      addLog('🔍 Demande d\'accès au port USB...', 'info')
      const selectedPort = await navigator.serial.requestPort()
      
      if (!selectedPort) {
        addLog('❌ Aucun port sélectionné.', 'error')
        return false
      }

      addLog('📡 Connexion au port à 115200 bauds...', 'info')
      await selectedPort.open({ baudRate: 115200 })

      const reader = selectedPort.readable.getReader()
      const writer = selectedPort.writable.getWriter()

      setPort(selectedPort)
      readerRef.current = reader
      writerRef.current = writer
      setIsConnected(true)

      addLog('✅ Connecté avec succès!', 'success')

      // Démarrer la lecture
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) {
              addLog('🔌 Fin de la lecture du port', 'info')
              break
            }
            
            const text = new TextDecoder().decode(value)
            
            // Parser les données JSON si possible
            try {
              if (text.trim().startsWith('{')) {
                const data = JSON.parse(text.trim())
                if (data.mode === 'usb_stream' || data.type === 'usb_stream') {
                  // Mettre à jour le dispositif connecté
                  setSelectedDevice({
                    sim_iccid: data.sim_iccid,
                    device_serial: data.device_serial,
                    firmware_version: data.firmware_version,
                    flow_lpm: data.flow_lpm,
                    battery_percent: data.battery_percent,
                    rssi: data.rssi,
                    timestamp: Date.now()
                  })
                }
              }
            } catch (e) {
              // Ignorer les erreurs de parsing, juste afficher les logs bruts
            }
            
            addLog(text, 'device')
          }
        } catch (error) {
          if (error.name !== 'NetworkError') {
            addLog(`❌ Erreur de lecture: ${error.message}`, 'error')
          }
        }
      }
      
      readLoop()
      return true

    } catch (error) {
      addLog(`❌ Erreur de connexion: ${error.message}`, 'error')
      return false
    }
  }, [addLog])

  // Déconnexion USB
  const disconnectUsb = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel()
        readerRef.current = null
      }
      if (writerRef.current) {
        writerRef.current = null
      }
      if (port) {
        await port.close()
        setPort(null)
      }
      setIsConnected(false)
      setSelectedDevice(null)
      addLog('🔌 Déconnecté', 'info')
    } catch (error) {
      addLog(`❌ Erreur de déconnexion: ${error.message}`, 'error')
    }
  }, [port, addLog])

  // Actions dispositif
  const handleAssignPatient = useCallback(async (device, patientId) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api.php/devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: patientId })
      })
      
      if (response.ok) {
        setSuccessMessage('✅ Patient assigné avec succès')
        refetchDevices()
        setShowAssignModal(false)
      }
    } catch (error) {
      logger.error('Erreur assignation patient:', error)
    }
  }, [fetchWithAuth, API_URL, refetchDevices])

  const handleUnassignPatient = useCallback(async (device) => {
    try {
      const response = await fetchWithAuth(`${API_URL}/api.php/devices/${device.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patient_id: null })
      })
      
      if (response.ok) {
        setSuccessMessage('✅ Patient désassigné avec succès')
        refetchDevices()
        setShowUnassignModal(false)
      }
    } catch (error) {
      logger.error('Erreur désassignation patient:', error)
    }
  }, [fetchWithAuth, API_URL, refetchDevices])

  const handleFlash = useCallback((device) => {
    setSelectedDevice(device)
    setShowFlashModal(true)
  }, [])

  // Permissions
  const hasPermission = user?.role_name === 'admin' || user?.role_name === 'technicien'

  return (
    <div className="space-y-6 p-6">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          📊 Tableau de Bord Dispositifs
        </h1>
        
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              🗄️ Afficher les archives
            </span>
          </label>
        </div>
      </div>

      {/* Message de succès */}
      {successMessage && (
        <SuccessMessage
          message={successMessage}
          onDismiss={() => setSuccessMessage(null)}
        />
      )}

      {/* Connexion USB */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          🔌 Connexion USB Directe
          {isConnected && (
            <span className="ml-2 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full animate-pulse">
              CONNECTÉ
            </span>
          )}
        </h2>
        
        <div className="flex gap-4 mb-4">
          <button
            onClick={connectUsb}
            disabled={isConnected}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              isConnected 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isConnected ? '✅ Connecté' : '🔌 Se Connecter'}
          </button>
          
          <button
            onClick={disconnectUsb}
            disabled={!isConnected}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              !isConnected 
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                : 'bg-red-600 text-white hover:bg-red-700'
            }`}
          >
            🔌 Se Déconnecter
          </button>
          
          <button
            onClick={() => setLogs([])}
            className="px-6 py-3 rounded-lg font-medium bg-gray-600 text-white hover:bg-gray-700"
          >
            🗑️ Vider les Logs
          </button>
        </div>

        {/* Dispositif connecté */}
        {selectedDevice && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <h3 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">
              📱 Dispositif Connecté
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600">ICCID:</span>
                <div className="font-mono font-medium">{selectedDevice.sim_iccid || 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">Serial:</span>
                <div className="font-mono font-medium">{selectedDevice.device_serial || 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">Firmware:</span>
                <div className="font-medium">{selectedDevice.firmware_version || 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">Débit:</span>
                <div className="font-medium">{selectedDevice.flow_lpm ? `${selectedDevice.flow_lpm} L/min` : 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">Batterie:</span>
                <div className="font-medium">{selectedDevice.battery_percent ? `${selectedDevice.battery_percent}%` : 'N/A'}</div>
              </div>
              <div>
                <span className="text-gray-600">RSSI:</span>
                <div className="font-medium">{selectedDevice.rssi ? `${selectedDevice.rssi} dBm` : 'N/A'}</div>
              </div>
            </div>
          </div>
        )}

        {/* Logs USB */}
        <div className="border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
          <div className="bg-gray-100 dark:bg-gray-900 px-4 py-2 border-b border-gray-300 dark:border-gray-600">
            <h3 className="font-mono text-sm font-semibold text-gray-700 dark:text-gray-300">
              📋 Logs USB ({logs.length} messages)
            </h3>
          </div>
          
          <div className="h-64 overflow-y-auto bg-black text-green-400 font-mono text-sm p-4">
            {logs.length === 0 ? (
              <div className="text-gray-500 text-center py-8">
                Aucun log... Connectez un dispositif pour voir les données en temps réel
              </div>
            ) : (
              logs.map((log, index) => (
                <div 
                  key={log.timestamp || index} 
                  className={`mb-1 ${
                    log.type === 'error' ? 'text-red-400' :
                    log.type === 'success' ? 'text-green-400' :
                    log.type === 'device' ? 'text-cyan-400' :
                    'text-green-400'
                  }`}
                >
                  {log.message}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Tableau des dispositifs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h2 className="text-lg font-semibold mb-4">
          {showArchived ? '🗄️ Dispositifs Archivés' : '📱 Dispositifs Actifs'}
        </h2>
        
        {devicesLoading ? (
          <div className="text-center py-8 text-gray-500">
            Chargement des dispositifs...
          </div>
        ) : devicesToDisplay.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-4">
              {showArchived ? '🗄️' : '📱'}
            </div>
            <p className="text-sm font-medium">
              {showArchived ? 'Aucun dispositif archivé' : 'Aucun dispositif trouvé'}
            </p>
            <p className="text-xs text-gray-400 mt-2">
              {showArchived ? 'Les dispositifs archivés apparaissent ici' : 'Connectez un dispositif USB pour commencer'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900 border-b">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Nom</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">ICCID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Firmware</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Patient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {devicesToDisplay.map((device) => {
                  const isArchived = isArchived(device)
                  const hasPatient = !!device.patient_id
                  const patientName = allPatients.find(p => p.id === device.patient_id)?.first_name + ' ' + allPatients.find(p => p.id === device.patient_id)?.last_name
                  
                  return (
                    <tr key={device.id} className={`border-b hover:bg-gray-50 dark:hover:bg-gray-800 ${isArchived ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{device.device_name || 'N/A'}</div>
                        {isArchived && (
                          <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                            🗄️ Archivé
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-sm">{device.sim_iccid || 'N/A'}</td>
                      <td className="px-4 py-3 text-sm">{device.firmware_version || 'N/A'}</td>
                      <td className="px-4 py-3">
                        {hasPatient ? (
                          <div className="text-sm">
                            <div className="font-medium">{patientName}</div>
                            <div className="text-xs text-gray-500">ID: {device.patient_id}</div>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">Non assigné</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          device.status === 'active' ? 'bg-green-100 text-green-800' :
                          device.status === 'inactive' ? 'bg-gray-100 text-gray-800' :
                          'bg-yellow-100 text-yellow-800'
                        }`}>
                          {device.status === 'active' ? '✅ Actif' :
                           device.status === 'inactive' ? '⏸️ Inactif' :
                           device.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {/* Bouton de visualisation des logs USB */}
                          <button
                            onClick={() => {
                              if (device.sim_iccid || device.device_serial) {
                                // Simuler la connexion USB pour voir les logs
                                setSelectedDevice({
                                  ...device,
                                  isVirtual: true
                                })
                                addLog(`📱 Affichage des logs pour: ${device.device_name || device.sim_iccid}`, 'info')
                              }
                            }}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                            title="Voir les logs USB"
                          >
                            📊 Logs
                          </button>
                          
                          {hasPermission && (
                            <button
                              onClick={() => handleAssignPatient(device)}
                              disabled={hasPatient}
                              className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                              title="Assigner un patient"
                            >
                              {hasPatient ? '📝 Modifier' : '🔗 Assigner'}
                            </button>
                          )}
                          
                          {hasPermission && hasPatient && (
                            <button
                              onClick={() => {
                                setSelectedDevice(device)
                                setShowUnassignModal(true)
                              }}
                              className="px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700"
                              title="Désassigner le patient"
                            >
                              🔓 Désassigner
                            </button>
                          )}
                          
                          {hasPermission && compiledFirmwares.length > 0 && (
                            <button
                              onClick={() => handleFlash(device)}
                              className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                              title="Flasher un firmware"
                            >
                              🚀 Flash
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modals */}
      {showAssignModal && selectedDevice && (
        <Modal isOpen={showAssignModal} onClose={() => setShowAssignModal(false)}>
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">🔗 Assigner un Patient</h3>
            <p className="text-sm text-gray-600 mb-4">
              Dispositif: <strong>{selectedDevice.device_name}</strong> ({selectedDevice.sim_iccid})
            </p>
            <select 
              id="patient-select"
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
              defaultValue=""
            >
              <option value="">Choisir un patient...</option>
              {allPatients.map(patient => (
                <option key={patient.id} value={patient.id}>
                  {patient.first_name} {patient.last_name} ({patient.id})
                </option>
              ))}
            </select>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowAssignModal(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  const select = document.getElementById('patient-select')
                  const patientId = select ? parseInt(select.value, 10) : null
                  if (patientId) {
                    handleAssignPatient(selectedDevice, patientId)
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Assigner
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showUnassignModal && selectedDevice && (
        <ConfirmModal
          isOpen={showUnassignModal}
          onClose={() => setShowUnassignModal(false)}
          title="🔓 Désassigner le Patient"
          message={`Êtes-vous sûr de vouloir désassigner le patient du dispositif "${selectedDevice.device_name}" ?`}
          onConfirm={() => handleUnassignPatient(selectedDevice)}
        />
      )}

      {showFlashModal && selectedDevice && (
        <Modal isOpen={showFlashModal} onClose={() => setShowFlashModal(false)} size="large">
          <div className="space-y-6">
            <h2 className="text-xl font-bold">🚀 Flash Firmware</h2>
            <p className="text-sm text-gray-600">
              Dispositif: <strong>{selectedDevice.device_name}</strong> ({selectedDevice.sim_iccid})
            </p>
            
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <h3 className="font-semibold text-yellow-800 mb-2">⚠️ Attention</h3>
              <p className="text-sm text-yellow-700">
                Le flash va déconnecter le dispositif et interrompre toute communication. 
                Assurez-vous que le dispositif est prêt et que vous avez sélectionné le bon firmware.
              </p>
            </div>
            
            <div className="space-y-4">
              {compiledFirmwares.map(firmware => (
                <div key={firmware.id} className="border rounded-lg p-4 hover:bg-gray-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium">{firmware.name || `Firmware ${firmware.id}`}</h4>
                      <p className="text-sm text-gray-600">
                        Version: {firmware.version || 'Inconnue'} | 
                        Créé: {new Date(firmware.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        // Logique de flash à implémenter
                        logger.log('Flash firmware:', firmware.id, 'sur dispositif:', selectedDevice.id)
                      }}
                      className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      🚀 Flasher
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
