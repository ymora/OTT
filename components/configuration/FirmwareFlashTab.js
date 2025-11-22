'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import { useUsb } from '@/contexts/UsbContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import FlashModal from '@/components/FlashModal'
import Modal from '@/components/Modal'
import { formatTimeAgo } from '@/lib/utils'
import logger from '@/lib/logger'

export default function FirmwareFlashTab() {
  const { fetchWithAuth, API_URL } = useAuth()
  const { usbConnectedDevice, usbVirtualDevice } = useUsb()
  
  const { data, loading, refetch } = useApiData(
    ['/api.php/firmwares', '/api.php/devices'],
    { requiresAuth: true }
  )

  const firmwares = data?.firmwares?.firmwares || []
  const devices = data?.devices?.devices || []

  const [selectedFirmwareForFlash, setSelectedFirmwareForFlash] = useState(null)
  const [showFlashModal, setShowFlashModal] = useState(false)
  const [deviceForFlash, setDeviceForFlash] = useState(null)
  const [flashMode, setFlashMode] = useState('usb')
  
  // États pour le flash multiple
  const [selectedDevices, setSelectedDevices] = useState(new Set())
  const [flashingDevices, setFlashingDevices] = useState({}) // { deviceId: { progress, status, logs } }
  const [flashMultipleMode, setFlashMultipleMode] = useState(false)
  
  // Console pour un dispositif spécifique
  const [consoleDevice, setConsoleDevice] = useState(null)
  const [showConsoleModal, setShowConsoleModal] = useState(false)

  // Toggle sélection dispositif
  const toggleDeviceSelection = useCallback((deviceId) => {
    setSelectedDevices(prev => {
      const next = new Set(prev)
      if (next.has(deviceId)) {
        next.delete(deviceId)
      } else {
        next.add(deviceId)
      }
      return next
    })
  }, [])

  // Sélectionner/désélectionner tous (via checkbox header)
  const toggleSelectAll = useCallback(() => {
    if (selectedDevices.size === devices.length) {
      setSelectedDevices(new Set())
    } else {
      setSelectedDevices(new Set(devices.map(d => d.id).filter(Boolean)))
    }
  }, [selectedDevices, devices])

  // Flasher un dispositif (OTA ou USB selon disponibilité)
  const flashDevice = useCallback(async (device, firmwareVersion) => {
    const deviceId = device.id
    if (!deviceId) return

    const isUsbConnected = usbConnectedDevice?.id === deviceId
    const isUsbVirtual = usbVirtualDevice && !device.id && usbVirtualDevice.sim_iccid === device.sim_iccid
    
    // Priorité USB si connecté
    const useUSB = isUsbConnected || isUsbVirtual
    
    setFlashingDevices(prev => ({
      ...prev,
      [deviceId]: {
        progress: 0,
        status: 'starting',
        logs: [`[${device.device_name || device.sim_iccid}] Démarrage flash ${useUSB ? 'USB' : 'OTA'}...`],
        mode: useUSB ? 'usb' : 'ota'
      }
    }))

    try {
      if (useUSB) {
        // Flash USB - nécessite le modal pour la connexion
        setDeviceForFlash(device)
        setFlashMode('usb')
        setShowFlashModal(true)
        // Le modal gérera le flash USB
        return
      } else {
        // Flash OTA
        setFlashingDevices(prev => ({
          ...prev,
          [deviceId]: {
            ...prev[deviceId],
            progress: 10,
            status: 'triggering',
            logs: [...(prev[deviceId]?.logs || []), `[${device.device_name || device.sim_iccid}] Déclenchement OTA...`]
          }
        }))

        await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/devices/${deviceId}/ota`,
          {
            method: 'POST',
            body: JSON.stringify({ firmware_version: firmwareVersion })
          },
          { requiresAuth: true }
        )

        setFlashingDevices(prev => ({
          ...prev,
          [deviceId]: {
            ...prev[deviceId],
            progress: 30,
            status: 'pending',
            logs: [...(prev[deviceId]?.logs || []), `[${device.device_name || device.sim_iccid}] ✅ Commande OTA programmée`]
          }
        }))

        // Vérifier le statut périodiquement
        const checkInterval = setInterval(async () => {
          try {
            const commandsData = await fetchJson(
              fetchWithAuth,
              API_URL,
              `/api.php/devices/${deviceId}/commands`,
              { method: 'GET' },
              { requiresAuth: true }
            )

            const commands = commandsData.commands || []
            const otaCommand = commands
              .filter(cmd => cmd.command === 'OTA_REQUEST')
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

            if (otaCommand) {
              const progress = otaCommand.status === 'pending' ? 50 :
                              otaCommand.status === 'executing' ? 75 :
                              otaCommand.status === 'executed' ? 100 : 30

              setFlashingDevices(prev => ({
                ...prev,
                [deviceId]: {
                  ...prev[deviceId],
                  progress,
                  status: otaCommand.status,
                  logs: [...(prev[deviceId]?.logs || []), 
                    `[${device.device_name || device.sim_iccid}] Statut: ${otaCommand.status}`]
                }
              }))

              if (otaCommand.status === 'executed' || otaCommand.status === 'error') {
                clearInterval(checkInterval)
                if (otaCommand.status === 'executed') {
                  // Mettre à jour la version firmware
                  try {
                    await fetchJson(
                      fetchWithAuth,
                      API_URL,
                      `/api.php/devices/${deviceId}`,
                      {
                        method: 'PUT',
                        body: JSON.stringify({ firmware_version: firmwareVersion })
                      },
                      { requiresAuth: true }
                    )
                  } catch (err) {
                    logger.warn('Erreur mise à jour version:', err)
                  }
                  await refetch()
                }
              }
            }
          } catch (err) {
            logger.warn('Erreur vérification statut OTA:', err)
          }
        }, 2000)

        // Timeout après 5 minutes
        setTimeout(() => {
          clearInterval(checkInterval)
        }, 5 * 60 * 1000)
      }
    } catch (err) {
      setFlashingDevices(prev => ({
        ...prev,
        [deviceId]: {
          ...prev[deviceId],
          status: 'error',
          logs: [...(prev[deviceId]?.logs || []), `[${device.device_name || device.sim_iccid}] ❌ Erreur: ${err.message}`]
        }
      }))
      logger.error('Erreur flash dispositif:', err)
    }
  }, [fetchWithAuth, API_URL, usbConnectedDevice, usbVirtualDevice, refetch])

  // Flasher un dispositif individuel (via icône flash)
  const handleFlashSingle = useCallback(async (device, e) => {
    e.stopPropagation()
    if (!selectedFirmwareForFlash) return
    
    const isUsbConnected = usbConnectedDevice?.id === device.id
    const isUsbVirtual = usbVirtualDevice && !device.id && usbVirtualDevice.sim_iccid === device.sim_iccid
    
    // Priorité USB si connecté
    if (isUsbConnected || isUsbVirtual) {
      setDeviceForFlash(device)
      setFlashMode('usb')
      setShowFlashModal(true)
    } else {
      // Flash OTA direct
      await flashDevice(device, selectedFirmwareForFlash.version)
    }
  }, [selectedFirmwareForFlash, usbConnectedDevice, usbVirtualDevice, flashDevice])

  // Flasher tous les dispositifs sélectionnés
  const handleFlashMultiple = useCallback(async () => {
    if (!selectedFirmwareForFlash || selectedDevices.size === 0) {
      return
    }

    setFlashMultipleMode(true)
    const deviceIds = Array.from(selectedDevices)
    
    // Flasher chaque dispositif (séquentiellement pour éviter la surcharge)
    for (const deviceId of deviceIds) {
      const device = devices.find(d => d.id === deviceId)
      if (device) {
        await flashDevice(device, selectedFirmwareForFlash.version)
        // Attendre un peu entre chaque flash pour éviter la surcharge
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }, [selectedDevices, selectedFirmwareForFlash, devices, flashDevice])

  // Ouvrir la console d'un dispositif
  const openDeviceConsole = useCallback((device) => {
    setConsoleDevice(device)
    setShowConsoleModal(true)
  }, [])

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">🔌 Flash</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Sélectionnez un firmware pour le flasher sur les dispositifs (USB ou OTA)
            </p>
          </div>
        </div>

        {/* Sélection du firmware */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Firmware à flasher</label>
          <select
            value={selectedFirmwareForFlash?.id || ''}
            onChange={(e) => {
              const fw = firmwares.find(f => f.id === parseInt(e.target.value))
              setSelectedFirmwareForFlash(fw)
              setSelectedDevices(new Set())
              setFlashingDevices({})
            }}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700"
          >
            <option value="">-- Sélectionner un firmware --</option>
            {firmwares
              .filter(fw => fw.status === 'compiled')
              .map((fw) => (
                <option key={fw.id} value={fw.id}>
                  v{fw.version} {fw.is_stable ? '(Stable)' : '(Beta)'}
                </option>
              ))}
          </select>
        </div>

        {/* Bouton Flash multiple (apparaît quand des dispositifs sont sélectionnés) */}
        {selectedDevices.size > 0 && selectedFirmwareForFlash && (
          <div className="mb-4">
            <button
              onClick={handleFlashMultiple}
              disabled={flashMultipleMode}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              🚀 Flasher {selectedDevices.size} dispositif{selectedDevices.size > 1 ? 's' : ''} ({flashMultipleMode ? 'En cours...' : 'OTA/USB'})
            </button>
          </div>
        )}

        {/* Liste des dispositifs */}
        {selectedFirmwareForFlash && (
          <div className="mt-6">
            <h3 className="font-semibold mb-3">
              Dispositifs disponibles ({devices.length})
            </h3>
            {loading ? (
              <LoadingSpinner />
            ) : devices.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">Aucun dispositif disponible</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase w-12">
                        {selectedFirmwareForFlash && (
                          <input
                            type="checkbox"
                            checked={selectedDevices.size === devices.length && devices.length > 0}
                            onChange={toggleSelectAll}
                            className="rounded"
                            title="Sélectionner tous"
                          />
                        )}
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Dispositif
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Version actuelle
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Statut
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Progression
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {devices.map((device) => {
                      const deviceFirmware = device.firmware_version || 'N/A'
                      const needsUpdate = deviceFirmware !== selectedFirmwareForFlash.version
                      const isUsbConnected = usbConnectedDevice?.id === device.id
                      const isUsbVirtual = usbVirtualDevice && !device.id
                      const isSelected = selectedDevices.has(device.id)
                      const flashStatus = flashingDevices[device.id]
                      
                      return (
                        <tr 
                          key={device.id || `virtual-${device.sim_iccid}`} 
                          className={`table-row cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${isSelected ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                          onClick={() => openDeviceConsole(device)}
                        >
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            {device.id && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleDeviceSelection(device.id)}
                                className="rounded"
                              />
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <p className="font-semibold text-primary">
                                {device.device_name || device.sim_iccid || 'Dispositif inconnu'}
                              </p>
                              <p className="text-xs text-gray-500 font-mono">{device.sim_iccid}</p>
                              {isUsbConnected && (
                                <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-xs">
                                  🔌 USB connecté
                                </span>
                              )}
                              {isUsbVirtual && (
                                <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded text-xs">
                                  🔌 USB - Non enregistré
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-sm">
                              {deviceFirmware}
                              {needsUpdate && (
                                <span className="ml-2 text-orange-600 dark:text-orange-400">
                                  → v{selectedFirmwareForFlash.version}
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            {device.last_seen ? (
                              <span className="text-xs text-gray-600">
                                Vu il y a {formatTimeAgo(device.last_seen)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">Jamais vu</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {flashStatus ? (
                              <div className="space-y-1.5 min-w-[200px]">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-gray-600 dark:text-gray-400">
                                    {flashStatus.status === 'starting' && '⏳ Démarrage...'}
                                    {flashStatus.status === 'triggering' && '📡 Déclenchement...'}
                                    {flashStatus.status === 'pending' && '⏳ En attente...'}
                                    {flashStatus.status === 'executing' && '🔄 Flash en cours...'}
                                    {flashStatus.status === 'executed' && '✅ Terminé'}
                                    {flashStatus.status === 'error' && '❌ Erreur'}
                                  </span>
                                  <span className="font-semibold text-primary-600 dark:text-primary-400">{flashStatus.progress}%</span>
                                </div>
                                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                                  <div
                                    className={`h-3 rounded-full transition-all duration-300 ${
                                      flashStatus.status === 'error' ? 'bg-red-500' :
                                      flashStatus.status === 'executed' ? 'bg-green-500' :
                                      'bg-primary-500'
                                    }`}
                                    style={{ width: `${flashStatus.progress}%` }}
                                  />
                                </div>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                            {selectedFirmwareForFlash && (
                              <button
                                onClick={(e) => handleFlashSingle(device, e)}
                                disabled={!!flashStatus && flashStatus.status !== 'executed' && flashStatus.status !== 'error'}
                                className="p-2 text-2xl hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title={isUsbConnected || isUsbVirtual ? 'Flasher via USB' : 'Flasher via OTA'}
                              >
                                {flashStatus ? (
                                  flashStatus.status === 'executed' ? '✅' :
                                  flashStatus.status === 'error' ? '❌' :
                                  '🔄'
                                ) : (
                                  '🚀'
                                )}
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Flash unifié (USB/OTA) */}
      <FlashModal
        isOpen={showFlashModal}
        onClose={() => {
          setShowFlashModal(false)
          setDeviceForFlash(null)
        }}
        device={deviceForFlash || usbVirtualDevice || usbConnectedDevice}
        preselectedFirmwareVersion={selectedFirmwareForFlash?.version}
        flashMode={flashMode}
      />

      {/* Modal Console pour un dispositif */}
      <Modal
        isOpen={showConsoleModal}
        onClose={() => {
          setShowConsoleModal(false)
          setConsoleDevice(null)
        }}
        title={`📟 Console - ${consoleDevice?.device_name || consoleDevice?.sim_iccid || 'Dispositif'}`}
        maxWidth="max-w-4xl"
      >
        {consoleDevice && (
          <div className="space-y-4">
            <div className="bg-gray-900 text-green-400 font-mono text-xs p-4 rounded-lg h-96 overflow-y-auto">
              {flashingDevices[consoleDevice.id]?.logs?.length > 0 ? (
                flashingDevices[consoleDevice.id].logs.map((log, idx) => (
                  <div key={idx} className="mb-1">
                    <span className="text-gray-500">
                      {new Date().toLocaleTimeString('fr-FR')}
                    </span>
                    {' '}
                    <span>{log}</span>
                  </div>
                ))
              ) : (
                <p className="text-gray-500">Aucun log disponible pour ce dispositif</p>
              )}
            </div>
            
            {flashingDevices[consoleDevice.id] && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">
                    Statut: {flashingDevices[consoleDevice.id].status}
                  </span>
                  <span className="font-semibold">
                    {flashingDevices[consoleDevice.id].progress}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all duration-300 ${
                      flashingDevices[consoleDevice.id].status === 'error' ? 'bg-red-500' :
                      flashingDevices[consoleDevice.id].status === 'executed' ? 'bg-green-500' :
                      'bg-primary-500'
                    }`}
                    style={{ width: `${flashingDevices[consoleDevice.id].progress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
