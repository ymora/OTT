'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState, useCallback, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData, useFilter, useEntityModal, useEntityDelete, useAutoRefresh, useDevicesUpdateListener } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import SearchBar from '@/components/SearchBar'
import UserPatientModal from '@/components/UserPatientModal'
import Modal from '@/components/Modal'
import ConfirmModal from '@/components/ConfirmModal'
import { isTrue } from '@/lib/utils'
import logger from '@/lib/logger'

export default function PatientsPage() {
  const { user: currentUser, fetchWithAuth, API_URL } = useAuth()
  const [success, setSuccess] = useState(null)
  const [actionError, setActionError] = useState(null)
  
  // Utiliser le hook useEntityModal pour gérer le modal
  const { isOpen: showModal, editingItem, openCreate: openCreateModal, openEdit: openEditModal, close: closeModal } = useEntityModal()
  const [unassigningDevice, setUnassigningDevice] = useState(null)
  const [assigningDevice, setAssigningDevice] = useState(null)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [selectedPatientForAssign, setSelectedPatientForAssign] = useState(null)
  const [showUnassignModal, setShowUnassignModal] = useState(false)
  const [selectedDeviceForUnassign, setSelectedDeviceForUnassign] = useState(null)
  const [showDeletePatientModal, setShowDeletePatientModal] = useState(false)
  const [patientToDelete, setPatientToDelete] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [restoringPatient, setRestoringPatient] = useState(null)

  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    [
      showArchived ? '/api.php/patients?include_deleted=true' : '/api.php/patients',
      '/api.php/devices'
    ],
    { requiresAuth: true }
  )

  // Utiliser le hook useAutoRefresh pour le rafraîchissement automatique
  useAutoRefresh(refetch, 30000)

  // Utiliser le hook useDevicesUpdateListener pour écouter les événements
  useDevicesUpdateListener(refetch)

  const allPatients = data?.patients?.patients || []
  const allDevices = data?.devices?.devices || []
  
  // Séparer les patients actifs et archivés
  const patients = useMemo(() => {
    return allPatients.filter(p => !p.deleted_at)
  }, [allPatients])
  
  const archivedPatients = useMemo(() => {
    return allPatients.filter(p => p.deleted_at)
  }, [allPatients])
  
  // Filtrer uniquement les dispositifs assignés aux patients
  const devices = useMemo(() => {
    return (allDevices || []).filter(d => d.patient_id)
  }, [allDevices])
  
  // Dispositifs libres (non assignés)
  const freeDevices = useMemo(() => {
    return (allDevices || []).filter(d => !d.patient_id && !d.deleted_at)
  }, [allDevices])

  // Utiliser useFilter pour la recherche
  const patientsToDisplay = showArchived ? allPatients : patients
  const {
    searchTerm,
    setSearchTerm,
    filteredItems: filteredPatients
  } = useFilter(patientsToDisplay, {
    searchFn: (items, term) => {
      const needle = term.toLowerCase()
      return items.filter(p => {
        const haystack = `${p.first_name || ''} ${p.last_name || ''} ${p.email || ''} ${p.phone || ''} ${p.device_name || ''}`.toLowerCase()
        return haystack.includes(needle)
      })
    }
  })


  const handleAssignDevice = async (patient, deviceId) => {
    if (!deviceId) {
      setActionError('Veuillez sélectionner un dispositif')
      return
    }

    try {
      setAssigningDevice(deviceId)
      setActionError(null)
      
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${deviceId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ patient_id: patient.id })
        },
        { requiresAuth: true }
      )
      
      setShowAssignModal(false)
      setSelectedPatientForAssign(null)
      await refetch()
      setSuccess(`Dispositif assigné avec succès à ${patient.first_name} ${patient.last_name}`)
    } catch (err) {
      let errorMessage = 'Erreur lors de l\'assignation du dispositif'
      if (err.message) {
        errorMessage = err.message
      } else if (err.error) {
        errorMessage = err.error
      }
      setActionError(errorMessage)
      logger.error('Erreur assignation dispositif:', err)
    } finally {
      setAssigningDevice(null)
    }
  }

  const handleUnassignDevice = async (device) => {
    try {
      setUnassigningDevice(device.id)
      setActionError(null)
      
      // 1. Désassigner le dispositif (mettre patient_id à null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({ patient_id: null })
        },
        { requiresAuth: true }
      )
      
      // 2. Réinitialiser la configuration du dispositif aux paramètres d'origine
      try {
        await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/devices/${device.id}/config`,
          {
            method: 'PUT',
            body: JSON.stringify({
              sleep_minutes: null,
              measurement_duration_ms: null,
              send_every_n_wakeups: null,
              calibration_coefficients: null
            })
          },
          { requiresAuth: true }
        )
      } catch (configErr) {
        // Ne pas bloquer si la réinitialisation de la config échoue
        logger.warn('Erreur réinitialisation config dispositif:', configErr)
      }
      
      setShowUnassignModal(false)
      setSelectedDeviceForUnassign(null)
      // Recharger les dispositifs et les patients
      await refetch()
      setSuccess('Dispositif désassigné et réinitialisé avec succès')
    } catch (err) {
      let errorMessage = 'Erreur lors de la désassignation du dispositif'
      if (err.message) {
        errorMessage = err.message
      } else if (err.error) {
        errorMessage = err.error
      }
      setActionError(errorMessage)
      logger.error('Erreur désassignation dispositif:', err)
    } finally {
      setUnassigningDevice(null)
    }
  }

  const openUnassignModal = (device) => {
    setSelectedDeviceForUnassign(device)
    setShowUnassignModal(true)
    setActionError(null)
  }

  const closeUnassignModal = () => {
    setShowUnassignModal(false)
    setSelectedDeviceForUnassign(null)
    setActionError(null)
  }

  const openAssignModal = (patient) => {
    setSelectedPatientForAssign(patient)
    setActionError(null)
    refetch()
    setShowAssignModal(true)
  }

  const closeAssignModal = () => {
    setShowAssignModal(false)
    setSelectedPatientForAssign(null)
    setActionError(null)
  }

  // Les fonctions openCreateModal, openEditModal, closeModal sont maintenant gérées par useEntityModal

  const handleModalSave = async () => {
    setSuccess(editingItem ? 'Patient modifié avec succès' : 'Patient créé avec succès')
    // Attendre un peu pour s'assurer que la base de données est bien mise à jour
    // puis refetch pour recharger les données avec les notifications mises à jour
    await new Promise(resolve => setTimeout(resolve, 100))
    await refetch()
  }

  const handleDelete = async (patient, confirmed = false) => {
    // Vérifier si le patient a un dispositif assigné
    const hasAssignedDevice = devices.some(d => d.patient_id === patient.id)
    
    if (!confirmed && hasAssignedDevice) {
      // Afficher le modal de confirmation si un dispositif est assigné
      setPatientToDelete(patient)
      setShowDeletePatientModal(true)
      return
    }

    // Si pas de dispositif assigné, utiliser la confirmation native
    if (!confirmed && !hasAssignedDevice) {
      if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer le patient "${patient.first_name} ${patient.last_name}" ?\n\nCette action est irréversible.`)) {
        return
      }
    }

    // Utiliser la fonction de suppression de base du hook
    try {
      setDeleteLoading(true)
      setActionError(null)
      setSuccess(null)
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/patients/${patient.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      if (response.success) {
        setSuccess(response.message || 'Patient supprimé avec succès')
        if (response.devices_unassigned > 0) {
          setSuccess(`Patient supprimé avec succès (${response.devices_unassigned} dispositif(s) désassigné(s) automatiquement)`)
        }
        refetch()
        if (showModal && editingItem && editingItem.id === patient.id) {
          closeModal()
        }
        setShowDeletePatientModal(false)
        setPatientToDelete(null)
      } else {
        setActionError(response.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      // Extraire le message d'erreur de la réponse si disponible
      let errorMessage = 'Erreur lors de la suppression du patient'
      if (err.message) {
        errorMessage = err.message
      } else if (err.error) {
        errorMessage = err.error
      }
      setActionError(errorMessage)
      logger.error('Erreur suppression patient:', err)
    } finally {
      setDeleteLoading(false)
    }
  }
  
  // Archiver le patient (soft delete)
  const handleArchivePatient = async () => {
    if (!patientToDelete) return
    
    try {
      setDeleteLoading(true)
      setActionError(null)
      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/patients/${patientToDelete.id}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      if (response.success) {
        setSuccess(response.message || '✅ Patient archivé avec succès')
        refetch()
        setShowDeletePatientModal(false)
        setPatientToDelete(null)
        if (showModal && editingItem && editingItem.id === patientToDelete.id) {
          closeModal()
        }
      } else {
        setActionError(response.error || 'Erreur lors de l\'archivage')
      }
    } catch (err) {
      setActionError(err.message || 'Erreur lors de l\'archivage')
      logger.error('Erreur archivage patient:', err)
    } finally {
      setDeleteLoading(false)
    }
  }
  
  // Suppression définitive (admins seulement)
  const handlePermanentDeletePatient = async () => {
    if (!patientToDelete) return
    
    try {
      setDeleteLoading(true)
      setActionError(null)
      const response = await fetchWithAuth(
        `${API_URL}/api.php/patients/${patientToDelete.id}?permanent=true`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        },
        { requiresAuth: true }
      )
      
      if (response.ok) {
        setSuccess('✅ Patient supprimé définitivement')
        refetch()
        setShowDeletePatientModal(false)
        setPatientToDelete(null)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setActionError(errorData.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      setActionError(err.message || 'Erreur lors de la suppression')
      logger.error('Erreur suppression définitive patient:', err)
    } finally {
      setDeleteLoading(false)
    }
  }
  
  // Restaurer un patient archivé
  const handleRestorePatient = async (patient) => {
    try {
      setRestoringPatient(patient.id)
      setActionError(null)
      const response = await fetchWithAuth(
        `${API_URL}/api.php/patients/${patient.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deleted_at: null })
        },
        { requiresAuth: true }
      )
      
      if (response.ok) {
        setSuccess('✅ Patient restauré avec succès !')
        await refetch()
        createTimeoutWithCleanup(() => setSuccess(null), 5000)
      } else {
        const errorData = await response.json().catch(() => ({}))
        setActionError(errorData.error || 'Erreur lors de la restauration')
      }
    } catch (err) {
      setActionError(err.message || 'Erreur lors de la restauration')
      logger.error('Erreur restauration patient:', err)
    } finally {
      setRestoringPatient(null)
    }
  }
  
  // Fonction utilitaire pour créer un timeout avec cleanup
  const timeoutRefs = useRef([])
  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeoutId => clearTimeout(timeoutId))
      timeoutRefs.current = []
    }
  }, [])
  
  const createTimeoutWithCleanup = (callback, delay) => {
    const timeoutId = setTimeout(() => {
      callback()
      timeoutRefs.current = timeoutRefs.current.filter(id => id !== timeoutId)
    }, delay)
    timeoutRefs.current.push(timeoutId)
    return timeoutId
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">👥 Patients</h1>
      </div>

      {/* Recherche, Toggle Archives et Nouveau Patient sur la même ligne */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un patient..."
          />
        </div>
        <div className="flex items-center gap-2">
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
        <button className="btn-primary" onClick={openCreateModal}>
          ➕ Nouveau Patient
        </button>
      </div>

      <div className="card">
        <ErrorMessage error={error} onRetry={refetch} />
        <ErrorMessage error={actionError} onClose={() => setActionError(null)} />
        <SuccessMessage message={success} onClose={() => setSuccess(null)} />
        {loading ? (
          <LoadingSpinner size="lg" text="Chargement des patients..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4">Nom</th>
                  <th className="text-left py-3 px-4">Date Naissance</th>
                  <th className="text-left py-3 px-4">Email</th>
                  <th className="text-left py-3 px-4">Téléphone</th>
                  <th className="text-left py-3 px-4">Ville</th>
                  <th className="text-left py-3 px-4">Code Postal</th>
                  <th className="text-left py-3 px-4">Dispositif</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-muted">
                      {searchTerm ? 'Aucun patient ne correspond à la recherche' : 'Aucun patient'}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((p, i) => {
                    const isArchived = !!p.deleted_at
                    return (
                    <tr 
                      key={p.id} 
                      className={`table-row animate-slide-up hover:bg-gray-50 dark:hover:bg-gray-800 ${isArchived ? 'opacity-60' : ''}`}
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="py-3 px-4 font-medium text-primary">
                        {p.first_name} {p.last_name}
                        {isArchived && (
                          <span className="ml-2 badge bg-gray-100 text-gray-600 text-xs">🗄️ Archivé</span>
                        )}
                      </td>
                      <td className="table-cell">{p.birth_date ? new Date(p.birth_date).toLocaleDateString('fr-FR') : '-'}</td>
                      <td className="table-cell">{p.email || '-'}</td>
                      <td className="table-cell text-sm">{p.phone || '-'}</td>
                      <td className="table-cell text-sm">{p.city || '-'}</td>
                      <td className="table-cell text-sm">{p.postal_code || '-'}</td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {(() => {
                            const assignedDevice = devices.find(d => d.patient_id === p.id)
                            if (assignedDevice) {
                              // Dispositif assigné : bouton désassigner + afficher les infos
                              return (
                                <>
                                  <button
                                    className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                    onClick={() => openUnassignModal(assignedDevice)}
                                    disabled={unassigningDevice === assignedDevice.id}
                                    title="Désassigner le dispositif du patient"
                                  >
                                    <span className="text-lg">{unassigningDevice === assignedDevice.id ? '⏳' : '🔓'}</span>
                                  </button>
                                  <div className="flex-1 space-y-1">
                                    <p className="font-medium text-primary">{assignedDevice.device_name || assignedDevice.sim_iccid}</p>
                                    <p className="text-xs text-muted font-mono">{assignedDevice.sim_iccid}</p>
                                  </div>
                                </>
                              )
                            } else {
                              // Pas de dispositif : bouton assigner + afficher "Non assigné"
                              return (
                                <>
                                  <button
                                    className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                                    onClick={() => openAssignModal(p)}
                                    disabled={freeDevices.length === 0}
                                    title={freeDevices.length === 0 ? "Aucun dispositif libre disponible" : "Assigner un dispositif libre au patient"}
                                  >
                                    <span className="text-lg">🔗</span>
                                  </button>
                                  <span className="flex-1 text-sm text-amber-600">Non assigné</span>
                                </>
                              )
                            }
                          })()}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {isArchived ? (
                            <button
                              className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                              onClick={() => handleRestorePatient(p)}
                              disabled={restoringPatient === p.id}
                              title="Restaurer le patient"
                            >
                              <span className="text-lg">{restoringPatient === p.id ? '⏳' : '♻️'}</span>
                            </button>
                          ) : (
                            <>
                              <button
                                className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                onClick={() => openEditModal(p)}
                                title="Modifier le patient"
                              >
                                <span className="text-lg">✏️</span>
                              </button>
                              <button
                                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                onClick={() => {
                                  setPatientToDelete(p)
                                  setShowDeletePatientModal(true)
                                }}
                                disabled={deleteLoading}
                                title={devices.some(d => d.patient_id === p.id) ? "Supprimer le patient (le dispositif sera désassigné automatiquement)" : "Supprimer le patient"}
                              >
                                <span className="text-lg">{deleteLoading ? '⏳' : '🗑️'}</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UserPatientModal
        isOpen={showModal}
        onClose={closeModal}
        editingItem={editingItem}
        type="patient"
        onSave={handleModalSave}
        fetchWithAuth={fetchWithAuth}
        API_URL={API_URL}
        roles={[]}
      />

      {/* Modal d'assignation de dispositif */}
      <Modal
        isOpen={showAssignModal}
        onClose={closeAssignModal}
        title={selectedPatientForAssign ? `🔗 Assigner un dispositif à ${selectedPatientForAssign.first_name} ${selectedPatientForAssign.last_name}` : ''}
      >
        {selectedPatientForAssign && (
          <>
            {actionError && (
              <div className="alert alert-warning mb-4">
                {actionError}
              </div>
            )}

            {freeDevices.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-gray-600 dark:text-gray-400 mb-4">
                  Aucun dispositif libre disponible
                </p>
                <button
                  className="btn-secondary"
                  onClick={closeAssignModal}
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Sélectionner un dispositif libre :
                  </label>
                  <select
                    id="device-select"
                    className="input w-full"
                    defaultValue=""
                  >
                    <option value="">— Sélectionner un dispositif —</option>
                    {freeDevices.map(device => (
                      <option key={device.id} value={device.id}>
                        {device.device_name || device.sim_iccid} {device.sim_iccid ? `(${device.sim_iccid})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2 justify-end">
                  <button
                    className="btn-secondary"
                    onClick={closeAssignModal}
                    disabled={assigningDevice !== null}
                  >
                    Annuler
                  </button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      const select = document.getElementById('device-select')
                      const deviceId = select ? parseInt(select.value, 10) : null
                      if (deviceId) {
                        handleAssignDevice(selectedPatientForAssign, deviceId)
                      } else {
                        setActionError('Veuillez sélectionner un dispositif')
                      }
                    }}
                    disabled={assigningDevice !== null}
                  >
                    {assigningDevice ? '⏳ Assignation...' : '🔗 Assigner'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </Modal>

      {/* Modal de désassignation de dispositif */}
      <Modal
        isOpen={showUnassignModal}
        onClose={closeUnassignModal}
        title="🔓 Désassigner le dispositif"
      >
        {selectedDeviceForUnassign && (
          <>
            {actionError && (
              <div className="alert alert-warning mb-4">
                {actionError}
              </div>
            )}

            <div className="mb-4">
              <p className="text-gray-700 dark:text-gray-300 mb-2">
                Êtes-vous sûr de vouloir désassigner le dispositif :
              </p>
              <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <p className="font-medium text-primary">
                  {selectedDeviceForUnassign.device_name || selectedDeviceForUnassign.sim_iccid}
                </p>
                <p className="text-xs text-muted font-mono mt-1">
                  {selectedDeviceForUnassign.sim_iccid}
                </p>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                ⚠️ Le dispositif sera réinitialisé avec les paramètres d&apos;origine et disponible pour une nouvelle assignation.
              </p>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="btn-secondary"
                onClick={closeUnassignModal}
                disabled={unassigningDevice === selectedDeviceForUnassign.id}
              >
                Annuler
              </button>
              <button
                className="btn-primary bg-orange-500 hover:bg-orange-600"
                onClick={() => handleUnassignDevice(selectedDeviceForUnassign)}
                disabled={unassigningDevice === selectedDeviceForUnassign.id}
              >
                {unassigningDevice === selectedDeviceForUnassign.id ? '⏳ Désassignation...' : '🔓 Désassigner'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Modal de confirmation de suppression de patient avec dispositif assigné */}
      <ConfirmModal
        isOpen={showDeletePatientModal}
        onClose={() => {
          setShowDeletePatientModal(false)
          setPatientToDelete(null)
        }}
        onConfirm={handleArchivePatient}
        onSecondAction={currentUser?.role_name === 'admin' ? handlePermanentDeletePatient : null}
        title={currentUser?.role_name === 'admin' ? '⚠️ Supprimer ou archiver ?' : 'Supprimer le patient'}
        message={`Patient : ${patientToDelete?.first_name || ''} ${patientToDelete?.last_name || ''}\n${patientToDelete?.email || ''}\n\n${
          patientToDelete && devices.some(d => d.patient_id === patientToDelete.id)
            ? '⚠️ Attention : Ce patient a un dispositif assigné.\nLe dispositif sera désassigné automatiquement.\n\n'
            : ''
        }${
          currentUser?.role_name === 'admin'
            ? 'Choisissez une action :\n\n🗄️ Archiver : Le patient peut être restauré\n🗑️ Supprimer définitivement : IRRÉVERSIBLE'
            : 'Cette action supprimera le patient.'
        }`}
        confirmText={currentUser?.role_name === 'admin' ? '🗄️ Archiver' : '🗑️ Supprimer'}
        secondActionText={currentUser?.role_name === 'admin' ? '🗑️ Supprimer définitivement' : null}
        variant={currentUser?.role_name === 'admin' ? 'warning' : 'danger'}
        secondActionVariant="danger"
        loading={deleteLoading}
      />
    </div>
  )
}

