'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useEntityPage, useAutoRefresh, useDevicesUpdateListener, useToggle } from '@/hooks'
import { fetchJson } from '@/lib/api'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import SearchBar from '@/components/SearchBar'
import UserPatientModal from '@/components/UserPatientModal'
import Modal from '@/components/Modal'
import logger from '@/lib/logger'

export default function PatientsPage() {
  // Utiliser le hook unifié pour toute la logique commune
  const {
    allItems: allPatients,
    items: patients,
    filteredItems: filteredPatients,
    searchTerm,
    setSearchTerm,
    loading,
    error,
    success,
    actionError,
    setSuccess,
    setActionError,
    resetMessages,
    showArchived,
    toggleShowArchived,
    showModal,
    editingItem,
    openCreateModal,
    openEditModal,
    closeModal,
    restore: handleRestorePatient,
    restoring: restoringPatient,
    archive: handleArchive,
    archiving,
    permanentDelete: handlePermanentDelete,
    deleting: deletingPermanent,
    hasPermission,
    isArchived,
    currentUser,
    fetchWithAuth,
    API_URL,
    refetch,
    invalidateCache,
    additionalData
  } = useEntityPage({
    entityType: 'patients',
    additionalEndpoints: ['/api.php/devices'],
    searchFn: (items, term) => {
      const needle = term.toLowerCase()
      return items.filter(p => {
        const haystack = `${p.first_name || ''} ${p.last_name || ''} ${p.email || ''} ${p.phone || ''} ${p.device_name || ''}`.toLowerCase()
        return haystack.includes(needle)
      })
    }
  })
  
  const allDevices = additionalData.devices || []
  
  // États spécifiques aux patients (assignation de dispositifs)
  const [unassigningDevice, setUnassigningDevice] = useState(null)
  const [assigningDevice, setAssigningDevice] = useState(null)
  const [showAssignModal, , setShowAssignModalTrue, setShowAssignModalFalse] = useToggle(false)
  const [selectedPatientForAssign, setSelectedPatientForAssign] = useState(null)
  const [showUnassignModal, , setShowUnassignModalTrue, setShowUnassignModalFalse] = useToggle(false)
  const [selectedDeviceForUnassign, setSelectedDeviceForUnassign] = useState(null)

  // Utiliser le hook useAutoRefresh pour le rafraîchissement automatique
  useAutoRefresh(refetch, 30000)

  // Utiliser le hook useDevicesUpdateListener pour écouter les événements
  useDevicesUpdateListener(refetch)

  // Filtrer uniquement les dispositifs assignés aux patients (non archivés)
  const devices = useMemo(() => {
    return (allDevices || []).filter(d => d.patient_id && !isArchived(d))
  }, [allDevices, isArchived])
  
  // Dispositifs libres (non assignés et non archivés)
  const freeDevices = useMemo(() => {
    return (allDevices || []).filter(d => !d.patient_id && !isArchived(d))
  }, [allDevices, isArchived])


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
      
      setShowAssignModalFalse()
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
      
      setShowUnassignModalFalse()
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
    setShowUnassignModalTrue()
    resetMessages()
  }

  const closeUnassignModal = () => {
    setShowUnassignModalFalse()
    setSelectedDeviceForUnassign(null)
    resetMessages()
  }

  const openAssignModal = (patient) => {
    // Ne pas ouvrir le modal pour les patients archivés
    if (patient?.deleted_at) {
      return
    }
    setSelectedPatientForAssign(patient)
    resetMessages()
    refetch()
    setShowAssignModalTrue()
  }

  const closeAssignModal = () => {
    setShowAssignModalFalse()
    setSelectedPatientForAssign(null)
    resetMessages()
  }

  // Les fonctions openCreateModal, openEditModal, closeModal sont maintenant gérées par useEntityModal

  const handleModalSave = async () => {
    setSuccess(editingItem ? 'Patient modifié avec succès' : 'Patient créé avec succès')
    // Attendre un peu pour s'assurer que la base de données est bien mise à jour
    // puis refetch pour recharger les données avec les notifications mises à jour
    await new Promise(resolve => setTimeout(resolve, 100))
    await refetch()
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
              onChange={toggleShowArchived}
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
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Nom</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Date Naissance</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Email</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Téléphone</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Ville</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Code Postal</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Dispositif</th>
                  <th className="text-right py-3 px-4 text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="py-8 text-center text-gray-500 dark:text-gray-400">
                      {searchTerm 
                        ? 'Aucun patient ne correspond à la recherche' 
                        : showArchived 
                          ? 'Aucun patient archivé' 
                          : 'Aucun patient'}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((p, i) => {
                    // Vérifier de manière plus robuste si le patient est archivé
                    const patientIsArchived = isArchived(p)
                    return (
                    <tr 
                      key={p.id} 
                      className={`table-row animate-slide-up hover:bg-gray-50 dark:hover:bg-gray-800 ${patientIsArchived ? 'opacity-60' : ''}`}
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="table-cell py-3 px-4 font-medium text-primary">
                        <div className="flex items-center gap-2">
                          <span>{p.first_name} {p.last_name}</span>
                          {patientIsArchived ? (
                            <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 text-xs">🗄️ Archivé</span>
                          ) : (
                            <span className="badge badge-success">✅ Actif</span>
                          )}
                        </div>
                      </td>
                      <td className="table-cell">{p.birth_date ? new Date(p.birth_date).toLocaleDateString('fr-FR') : '-'}</td>
                      <td className="table-cell">{p.email || '-'}</td>
                      <td className="table-cell text-sm">{p.phone || '-'}</td>
                      <td className="table-cell text-sm">{p.city || '-'}</td>
                      <td className="table-cell text-sm">{p.postal_code || '-'}</td>
                      <td className="table-cell py-3 px-4">
                        {(() => {
                          const assignedDevice = devices.find(d => d.patient_id === p.id)
                          if (assignedDevice) {
                            return (
                              <div className="space-y-1">
                                <p className="font-medium text-primary">{assignedDevice.device_name || assignedDevice.sim_iccid}</p>
                                <p className="text-xs text-muted font-mono">{assignedDevice.sim_iccid}</p>
                              </div>
                            )
                          } else {
                            return <span className="text-sm text-amber-600">Non assigné</span>
                          }
                        })()}
                      </td>
                      <td className="table-cell py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {patientIsArchived ? (
                            <button
                              onClick={() => handleRestorePatient(p)}
                              disabled={restoringPatient === p.id}
                              className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors disabled:opacity-50"
                              title="Restaurer le patient"
                            >
                              <span className="text-lg">{restoringPatient === p.id ? '⏳' : '♻️'}</span>
                            </button>
                          ) : (
                            <>
                              {/* Icônes d'assignation/désassignation de dispositif */}
                              {(() => {
                                const assignedDevice = devices.find(d => d.patient_id === p.id)
                                if (assignedDevice) {
                                  // Dispositif assigné : bouton désassigner
                                  return (
                                    <button
                                      className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                      onClick={() => openUnassignModal(assignedDevice)}
                                      disabled={unassigningDevice === assignedDevice.id}
                                      title="Désassigner le dispositif du patient"
                                    >
                                      <span className="text-lg">{unassigningDevice === assignedDevice.id ? '⏳' : '🔓'}</span>
                                    </button>
                                  )
                                } else {
                                  // Pas de dispositif : bouton assigner
                                  return (
                                    <button
                                      className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 rounded-lg transition-colors"
                                      onClick={() => openAssignModal(p)}
                                      disabled={freeDevices.length === 0}
                                      title={freeDevices.length === 0 ? "Aucun dispositif libre disponible" : "Assigner un dispositif libre au patient"}
                                    >
                                      <span className="text-lg">🔗</span>
                                    </button>
                                  )
                                }
                              })()}
                              
                              <button
                                className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                                onClick={() => openEditModal(p)}
                                title="Modifier le patient"
                              >
                                <span className="text-lg">✏️</span>
                              </button>
                              {hasPermission('patients.edit') && (
                                <>
                                  {/* Administrateurs : Archive + Suppression définitive */}
                                  {currentUser?.role_name === 'admin' ? (
                                    <>
                                      <button
                                        className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                        onClick={() => handleArchive(p)}
                                        disabled={archiving === p.id}
                                        title="Archiver le patient"
                                      >
                                        <span className="text-lg">{archiving === p.id ? '⏳' : '🗄️'}</span>
                                      </button>
                                      <button
                                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                                        onClick={() => handlePermanentDelete(p)}
                                        disabled={deletingPermanent === p.id}
                                        title="Supprimer définitivement le patient"
                                      >
                                        <span className="text-lg">{deletingPermanent === p.id ? '⏳' : '🗑️'}</span>
                                      </button>
                                    </>
                                  ) : (
                                    /* Non-administrateurs : Archive uniquement (pas de suppression définitive) */
                                      <button
                                        className="p-2 hover:bg-orange-100 dark:hover:bg-orange-900/30 rounded-lg transition-colors"
                                        onClick={() => handleArchive(p)}
                                        disabled={archiving === p.id}
                                        title="Archiver le patient"
                                      >
                                        <span className="text-lg">{archiving === p.id ? '⏳' : '🗄️'}</span>
                                      </button>
                                  )}
                                </>
                              )}
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

      {/* Plus de modal - actions directes selon le rôle */}
    </div>
  )
}

