'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useUsb } from '@/contexts/UsbContext'
import { useUsbAutoDetection, useApiData, useEntityArchive } from '@/hooks'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'
import InoEditorTab from '@/components/configuration/InoEditorTab'
import UsbStreamingTab from '@/components/configuration/UsbStreamingTab'
// DeviceDashboard supprimé - fonctionnalités fusionnées dans UsbStreamingTab
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import DeviceModal from '@/components/DeviceModal'
// FlashModal supprimé - composant non utilisé
// DeviceMeasurementsModal supprimé - composant non utilisé
import ConfirmModal from '@/components/ConfirmModal'
import Modal from '@/components/Modal'

export default function OutilsPage() {
  const { user, fetchWithAuth, API_URL } = useAuth()
  const { 
    isSupported, 
    autoDetecting, 
    setAutoDetecting, 
    usbDevice,
    usbDeviceInfo,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback
  } = useUsb()
  
  // Activer la détection automatique USB
  useUsbAutoDetection(isSupported, autoDetecting, setAutoDetecting, usbDevice)

  // Cleanup au démontage
  useEffect(() => {
    return () => {
      logger.debug('[OUTILS] Cleanup')
    }
  }, [])
  
  // Configurer les callbacks USB pour enregistrer automatiquement les dispositifs dans la base
  useEffect(() => {
    if (!fetchWithAuth || !API_URL) {
      return
    }
    
    const sendMeasurement = async (measurementData) => {
      try {
        const response = await fetchWithAuth(
          `${API_URL}/api.php/devices/measurements`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(measurementData)
          },
          { requiresAuth: false }
        )
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
        }
        
        return await response.json()
      } catch (err) {
        logger.error('❌ Erreur envoi mesure USB:', err)
        throw err
      }
    }
    
    const updateDevice = async (identifier, firmwareVersion, updateData = {}) => {
      try {
        const devicesResponse = await fetchWithAuth(
          `${API_URL}/api.php/devices`,
          { method: 'GET' },
          { requiresAuth: true }
        )
        
        if (!devicesResponse.ok) return
        
        const devicesData = await devicesResponse.json()
        const devices = devicesData.devices || []
        
        const device = devices.find(d => 
          d.sim_iccid === identifier || 
          d.device_serial === identifier ||
          d.device_name === identifier
        )
        
        // ⚠️ AUTO-CRÉATION DÉSACTIVÉE via USB: Ne pas créer automatiquement depuis le frontend pour éviter les conflits
        // L'enregistrement en base se fera automatiquement via OTA quand le dispositif enverra sa première mesure
        // (voir api/handlers/devices/measurements.php ligne 69 - auto-création lors de POST /devices/measurements)
        // Le dispositif apparaîtra dans le tableau via usbDevice (virtuel) jusqu'à ce qu'il soit enregistré via OTA
        if (!device) {
          // Ne pas créer automatiquement depuis le frontend - l'enregistrement se fera via OTA
          // Ne pas logger pour éviter le spam, mais ne pas bloquer non plus
          return
        }
        
        // MISE À JOUR: Le dispositif existe
        const updatePayload = { ...updateData }
        if (firmwareVersion && firmwareVersion !== '') {
          updatePayload.firmware_version = firmwareVersion
        }
        
        await fetchWithAuth(
          `${API_URL}/api.php/devices/${device.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          },
          { requiresAuth: true }
        )
      } catch (err) {
        // Ignorer silencieusement les erreurs de mise à jour
      }
    }
    
    setSendMeasurementCallback(sendMeasurement)
    setUpdateDeviceFirmwareCallback(updateDevice)
    
    return () => {
      setSendMeasurementCallback(null)
      setUpdateDeviceFirmwareCallback(null)
    }
  }, [fetchWithAuth, API_URL, setSendMeasurementCallback, setUpdateDeviceFirmwareCallback])

  // Vérifier les permissions (admin ou technicien)
  const canAccess = user?.role_name === 'admin' || user?.role_name === 'technicien'

  // Onglet actif (Dispositifs par défaut)
  const [activeTab, setActiveTab] = useState('streaming')
  
  // Log changement onglet (debug uniquement)
  useEffect(() => {
    logger.debug('[OUTILS] Onglet:', activeTab)
  }, [activeTab])

  // Charger les dispositifs pour le tableau (toujours appeler les hooks, même si canAccess est false)
  const { data: devicesData, loading: devicesLoading, error: devicesError, refetch: refetchDevices } = useApiData(
    ['/api.php/devices'],
    { requiresAuth: true, skip: !canAccess, autoLoad: canAccess } // Skip si pas d'accès
  )
  
  // Charger les patients pour le modal d'assignation
  const { data: patientsData } = useApiData(
    ['/api.php/patients'],
    { requiresAuth: true, skip: !canAccess, autoLoad: canAccess } // Skip si pas d'accès
  )
  
  const allPatients = patientsData?.patients?.patients || []
  const allDevices = devicesData?.devices?.devices || []
  
  // États pour les modals (toujours déclarer, même si canAccess est false)
  const [showDeviceModal, setShowDeviceModal] = useState(false)
  // FlashModal supprimé - composant non utilisé
  // const [showFlashModal, setShowFlashModal] = useState(false)
  // DeviceMeasurementsModal supprimé - composant non utilisé
  // const [showMeasurementsModal, setShowMeasurementsModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [showArchiveModal, setShowArchiveModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [deleting, setDeleting] = useState(null)
  
  // Utiliser le hook unifié pour l'archivage (toujours appeler, même si canAccess est false)
  const { archive: handleArchive, archiving } = useEntityArchive({
    fetchWithAuth,
    API_URL,
    entityType: 'devices',
    refetch: refetchDevices,
    onSuccess: (device) => {
      logger.log(`✅ Dispositif "${device.device_name}" archivé`)
      setShowArchiveModal(false)
      setSelectedDevice(null)
    },
    onError: (error) => {
      logger.error('Erreur archivage dispositif:', error)
    },
    onCloseModal: () => setShowArchiveModal(false),
    editingItem: selectedDevice,
    currentUser: user
  })
  
  const openDeviceModal = (device) => {
    setSelectedDevice(device)
    setShowDeviceModal(true)
  }
  
  const closeDeviceModal = () => {
    setSelectedDevice(null)
    setShowDeviceModal(false)
    refetchDevices()
  }
  
  const handleDelete = async (device) => {
    if (!device.id) return
    setDeleting(device.id)
    try {
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}?permanent=true`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      await refetchDevices()
      logger.log(`✅ Dispositif "${device.device_name}" supprimé définitivement`)
    } catch (err) {
      logger.error('Erreur suppression dispositif:', err)
    } finally {
      setDeleting(null)
      setShowDeleteModal(false)
    }
  }

  const tabs = [
    { id: 'streaming', label: 'Dispositifs & USB', icon: '🔌' },
    { id: 'ino', label: 'Firmware (.ino)', icon: '📝' }
  ]

  return (
    <div className="space-y-6">
      {/* Onglets */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                py-4 px-1 border-b-2 font-medium text-sm transition-colors relative
                ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenu des onglets - Ne pas démonter les composants pour garder les connexions SSE ouvertes */}
      <div className="mt-6">
        <div style={{ display: activeTab === 'streaming' ? 'block' : 'none' }}>
          <UsbStreamingTab />
        </div>
        <div style={{ display: activeTab === 'ino' ? 'block' : 'none' }}>
          <InoEditorTab />
        </div>
      </div>
      
      {/* Modal de dispositif */}
      {showDeviceModal && (
        <DeviceModal
          isOpen={showDeviceModal}
          onClose={closeDeviceModal}
          editingItem={selectedDevice}
          onSave={() => {
            closeDeviceModal()
            refetchDevices()
          }}
          patients={allPatients}
          allDevices={allDevices}
        />
      )}
      
      {/* Modal Flash supprimé - composant non utilisé */}
      {/*
      {showFlashModal && selectedDevice && (
        <FlashModal
          isOpen={showFlashModal}
          onClose={() => {
            setShowFlashModal(false)
            setSelectedDevice(null)
          }}
          device={selectedDevice}
        />
      )}
      */}
      
      {/* Modal Mesures supprimée - composant non utilisé */}
      {/*
      {showMeasurementsModal && selectedDevice && (
        <DeviceMeasurementsModal
          isOpen={showMeasurementsModal}
          onClose={() => {
            setShowMeasurementsModal(false)
            setSelectedDevice(null)
          }}
          device={selectedDevice}
        />
      )}
      */}
      
      {/* Modal Assignation Patient */}
      {showAssignModal && selectedDevice && (
        <Modal
          isOpen={showAssignModal}
          onClose={() => {
            setShowAssignModal(false)
            setSelectedDevice(null)
          }}
          title={`🔗 Assigner le dispositif ${selectedDevice.device_name || selectedDevice.sim_iccid}`}
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Sélectionnez un patient pour assigner ce dispositif :
            </p>
            <select
              className="input w-full"
              onChange={async (e) => {
                const patientId = e.target.value ? parseInt(e.target.value) : null
                try {
                  await fetchJson(
                    fetchWithAuth,
                    API_URL,
                    `/api.php/devices/${selectedDevice.id}`,
                    {
                      method: 'PUT',
                      body: JSON.stringify({ patient_id: patientId })
                    },
                    { requiresAuth: true }
                  )
                  await refetchDevices()
                  setShowAssignModal(false)
                  setSelectedDevice(null)
                  logger.log(`✅ Dispositif assigné au patient`)
                } catch (err) {
                  logger.error('Erreur assignation:', err)
                }
              }}
            >
              <option value="">Non assigné</option>
              {allPatients.filter(p => !p.deleted_at).map(patient => (
                <option key={patient.id} value={patient.id} selected={selectedDevice.patient_id === patient.id}>
                  {patient.first_name} {patient.last_name}
                </option>
              ))}
            </select>
          </div>
        </Modal>
      )}
      
      {/* Modal Archive */}
      {showArchiveModal && selectedDevice && (
        <ConfirmModal
          isOpen={showArchiveModal}
          onClose={() => {
            setShowArchiveModal(false)
            setSelectedDevice(null)
          }}
          onConfirm={() => handleArchive(selectedDevice)}
          title="🗄️ Archiver le dispositif"
          message={`Êtes-vous sûr de vouloir archiver le dispositif "${selectedDevice.device_name || selectedDevice.sim_iccid}" ?`}
          confirmText="Archiver"
          confirmVariant="warning"
        />
      )}
      
      {/* Modal Suppression */}
      {showDeleteModal && selectedDevice && (
        <ConfirmModal
          isOpen={showDeleteModal}
          onClose={() => {
            setShowDeleteModal(false)
            setSelectedDevice(null)
          }}
          onConfirm={() => handleDelete(selectedDevice)}
          title="🗑️ Supprimer définitivement"
          message={`Êtes-vous sûr de vouloir supprimer définitivement le dispositif "${selectedDevice.device_name || selectedDevice.sim_iccid}" ? Cette action est irréversible.`}
          confirmText="Supprimer"
          confirmVariant="danger"
        />
      )}

    </div>
  )
}
