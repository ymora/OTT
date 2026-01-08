'use client'

import { useState, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiCall } from '@/hooks'
import ErrorMessage from '@/components/ErrorMessage'
import Tooltip from '@/components/Tooltip'
import ConfirmModal from '@/components/ConfirmModal'
import logger from '@/lib/logger'
import { useUsb } from '@/contexts/UsbContext'
import { buildUpdateConfigPayload } from '@/lib/deviceCommands'

// Sous-composants refactorisés
import Accordion from '@/components/common/Accordion'
import DeviceGeneralInfo from '@/components/device/DeviceGeneralInfo'
import DeviceConfig from '@/components/device/DeviceConfig'
import DeviceFirmware from '@/components/device/DeviceFirmware'
import DeviceConnectivity from '@/components/device/DeviceConnectivity'

/**
 * Modal pour créer/modifier un dispositif
 * Version refactorisée en sous-composants
 */
export default function DeviceModal({ isOpen, onClose, editingItem, onSave, patients, allDevices, appendLog }) {
  const { fetchWithAuth, API_URL } = useAuth()
  const { loading, error, call } = useApiCall({ requiresAuth: true })
  const { usbPort } = useUsb()
  
  const [device, setDevice] = useState({
    serial_number: '',
    sim_iccid: '',
    patient_id: '',
    status: 'active',
    notes: '',
    measurement_interval: 60,
    battery_threshold: 20,
    transmission_mode: 'realtime',
    log_level: 'info',
    enable_gps: true,
    enable_alerts: true,
    enable_auto_update: false,
    current_firmware_id: null,
    target_firmware_id: null,
    bootloader_version: '',
    firmware_updated_at: null,
    firmware_notes: '',
    network_operator: '',
    signal_strength: null,
    apn: '',
    connection_status: 'offline',
    ip_address: '',
    last_seen: null,
    ...editingItem
  })

  const [firmwares, setFirmwares] = useState([])
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [confirmModalConfig, setConfirmModalConfig] = useState({})

  // Charger les firmwares disponibles
  useMemo(() => {
    const loadFirmwares = async () => {
      try {
        const response = await fetchWithAuth(`${API_URL}/api.php/firmwares`)
        if (response.ok) {
          const data = await response.json()
          setFirmwares(data.data?.firmwares?.firmwares || [])
        }
      } catch (error) {
        logger.error('Erreur chargement firmwares:', error)
      }
    }
    
    if (isOpen) {
      loadFirmwares()
    }
  }, [isOpen, fetchWithAuth, API_URL])

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault()
    
    const isEdit = !!editingItem?.id
    const url = isEdit 
      ? `${API_URL}/api.php/devices/${editingItem.id}`
      : `${API_URL}/api.php/devices`
    
    const method = isEdit ? 'PUT' : 'POST'
    
    await call(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(device)
    })
    
    if (!error) {
      onSave()
      onClose()
    }
  }, [device, editingItem, call, error, onSave, onClose, API_URL])

  const handleDelete = useCallback(() => {
    setConfirmModalConfig({
      title: 'Supprimer le dispositif',
      message: `Êtes-vous sûr de vouloir supprimer le dispositif ${device.serial_number} ?`,
      onConfirm: async () => {
        await call(`${API_URL}/api.php/devices/${editingItem.id}`, {
          method: 'DELETE'
        })
        
        if (!error) {
          onSave()
          onClose()
        }
      }
    })
    setShowConfirmModal(true)
  }, [device, editingItem, call, error, onSave, onClose, API_URL])

  const handleUsbConfig = useCallback(async () => {
    if (!usbPort || !device.serial_number) {
      logger.warn('Port USB ou numéro de série manquant')
      return
    }

    try {
      const configPayload = buildUpdateConfigPayload(device)
      
      // Envoyer la configuration via USB
      if (appendLog) {
        appendLog(`Envoi configuration au dispositif ${device.serial_number}...`, 'info')
      }
      
      // Logique d'envoi USB à implémenter
      logger.info('Configuration USB envoyée:', configPayload)
      
    } catch (error) {
      logger.error('Erreur configuration USB:', error)
      if (appendLog) {
        appendLog(`Erreur configuration: ${error.message}`, 'error')
      }
    }
  }, [usbPort, device, appendLog])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {editingItem ? 'Modifier le dispositif' : 'Nouveau dispositif'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && <ErrorMessage message={error} />}

          {/* Informations générales */}
          <Accordion title="Informations générales" defaultOpen={true}>
            <DeviceGeneralInfo 
              device={device} 
              setDevice={setDevice} 
              patients={patients} 
              allDevices={allDevices} 
            />
          </Accordion>

          {/* Configuration */}
          <Accordion title="Configuration">
            <DeviceConfig device={device} setDevice={setDevice} />
          </Accordion>

          {/* Firmware */}
          <Accordion title="Firmware">
            <DeviceFirmware device={device} setDevice={setDevice} firmwares={firmwares} />
          </Accordion>

          {/* Connectivité */}
          <Accordion title="Connectivité">
            <DeviceConnectivity device={device} setDevice={setDevice} />
          </Accordion>

          {/* Actions */}
          <div className="flex justify-between items-center pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="flex space-x-3">
              {editingItem && (
                <>
                  <button
                    type="button"
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    Supprimer
                  </button>
                  
                  {usbPort && (
                    <button
                      type="button"
                      onClick={handleUsbConfig}
                      className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                    >
                      <Tooltip content="Envoyer la configuration via USB">
                        Configurer USB
                      </Tooltip>
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Annuler
              </button>
              
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {loading ? 'Sauvegarde...' : (editingItem ? 'Mettre à jour' : 'Créer')}
              </button>
            </div>
          </div>
        </form>
      </div>

      {showConfirmModal && (
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={() => setShowConfirmModal(false)}
          onConfirm={confirmModalConfig.onConfirm}
          title={confirmModalConfig.title}
          message={confirmModalConfig.message}
        />
      )}
    </div>
  )
}
