'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import { useUsb } from '@/contexts/UsbContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import FlashModal from '@/components/FlashModal'
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
  const [flashMode, setFlashMode] = useState('usb') // 'usb' ou 'ota'

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">🔌 Flash USB & OTA</h2>
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
                      
                      return (
                        <tr key={device.id || `virtual-${device.sim_iccid}`} className="table-row">
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
                            <div className="flex gap-2">
                              {/* Bouton Flash USB */}
                              {(isUsbConnected || isUsbVirtual) && (
                                <button
                                  onClick={() => {
                                    setDeviceForFlash(device)
                                    setFlashMode('usb')
                                    setShowFlashModal(true)
                                  }}
                                  className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
                                  title="Flasher via USB"
                                >
                                  🔌 USB
                                </button>
                              )}
                              
                              {/* Bouton Flash OTA */}
                              {device.id && (
                                <button
                                  onClick={() => {
                                    setDeviceForFlash(device)
                                    setFlashMode('ota')
                                    setShowFlashModal(true)
                                  }}
                                  className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors"
                                  title="Flasher via OTA (Over-The-Air)"
                                >
                                  📡 OTA
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
    </div>
  )
}

