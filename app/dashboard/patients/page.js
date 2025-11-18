'use client'

import { useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData, useFilter } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import SearchBar from '@/components/SearchBar'
import UserPatientModal from '@/components/UserPatientModal'
import { isTrue } from '@/lib/utils'

export default function PatientsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [success, setSuccess] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [unassigningDevice, setUnassigningDevice] = useState(null)

  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    ['/api.php/patients', '/api.php/devices'],
    { requiresAuth: false }
  )

  const patients = data?.patients?.patients || []
  const allDevices = data?.devices?.devices || []
  // Filtrer uniquement les dispositifs assignés aux patients
  const devices = useMemo(() => {
    return (allDevices || []).filter(d => d.patient_id)
  }, [allDevices])

  // Utiliser useFilter pour la recherche
  const {
    searchTerm,
    setSearchTerm,
    filteredItems: filteredPatients
  } = useFilter(patients, {
    searchFn: (items, term) => {
      const needle = term.toLowerCase()
      return items.filter(p => {
        const haystack = `${p.first_name || ''} ${p.last_name || ''} ${p.email || ''} ${p.phone || ''} ${p.device_name || ''}`.toLowerCase()
        return haystack.includes(needle)
      })
    }
  })


  const handleUnassignDevice = async (device) => {
    if (!confirm(`⚠️ Êtes-vous sûr de vouloir désassigner le dispositif "${device.device_name || device.sim_iccid}" du patient ?\n\nLe dispositif sera réinitialisé avec les paramètres d'origine et disponible pour une nouvelle assignation.`)) {
      return
    }

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
        console.warn('Erreur réinitialisation config dispositif:', configErr)
      }
      
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
      console.error('Erreur désassignation dispositif:', err)
    } finally {
      setUnassigningDevice(null)
    }
  }

  const openCreateModal = () => {
    setEditingItem(null)
    setShowModal(true)
  }

  const openEditModal = (patient) => {
    setEditingItem(patient)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingItem(null)
  }

  const handleModalSave = async () => {
    setSuccess(editingItem ? 'Patient modifié avec succès' : 'Patient créé avec succès')
    // Attendre un peu pour s'assurer que la base de données est bien mise à jour
    // puis refetch pour recharger les données avec les notifications mises à jour
    await new Promise(resolve => setTimeout(resolve, 100))
    await refetch()
  }

  const handleDelete = async (patient) => {
    if (!confirm(`⚠️ Êtes-vous sûr de vouloir supprimer le patient "${patient.first_name} ${patient.last_name}" ?\n\nCette action est irréversible.`)) {
      return
    }

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
        refetch()
        if (showModal && editingItem && editingItem.id === patient.id) {
          closeModal()
        }
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
      console.error('Erreur suppression patient:', err)
    } finally {
      setDeleteLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">👥 Patients</h1>
      </div>

      {/* Recherche et Nouveau Patient sur la même ligne */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un patient..."
          />
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
                  <th className="text-left py-3 px-4">Notifications</th>
                  <th className="text-left py-3 px-4">Types d'alertes</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="py-8 text-center text-muted">
                      {searchTerm ? 'Aucun patient ne correspond à la recherche' : 'Aucun patient'}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((p, i) => (
                    <tr key={p.id} className="table-row animate-slide-up" style={{animationDelay: `${i * 0.05}s`}}>
                      <td className="py-3 px-4 font-medium text-primary">{p.first_name} {p.last_name}</td>
                      <td className="table-cell">{p.birth_date ? new Date(p.birth_date).toLocaleDateString('fr-FR') : '-'}</td>
                      <td className="table-cell">{p.email || '-'}</td>
                      <td className="table-cell text-sm">{p.phone || '-'}</td>
                      <td className="table-cell text-sm">{p.city || '-'}</td>
                      <td className="table-cell text-sm">{p.postal_code || '-'}</td>
                      <td className="py-3 px-4">
                        {p.device_name ? (
                          <div className="space-y-1">
                            <p className="font-medium text-primary">{p.device_name}</p>
                            <p className="text-xs text-muted font-mono">{p.sim_iccid}</p>
                          </div>
                        ) : (
                          <span className="text-sm text-amber-600">Non assigné</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {isTrue(p.email_enabled) ? (
                            <span className="text-lg" title="Email activé">✉️</span>
                          ) : (
                            <span className="text-lg opacity-40 grayscale" title="Email désactivé">✉️</span>
                          )}
                          {isTrue(p.sms_enabled) ? (
                            <span className="text-lg" title="SMS activé">📱</span>
                          ) : (
                            <span className="text-lg opacity-40 grayscale" title="SMS désactivé">📱</span>
                          )}
                          {isTrue(p.push_enabled) ? (
                            <span className="text-lg" title="Push activé">🔔</span>
                          ) : (
                            <span className="text-lg opacity-40 grayscale" title="Push désactivé">🔔</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {isTrue(p.notify_battery_low) && (
                            <span className="text-xs" title="Batterie faible">🔋</span>
                          )}
                          {isTrue(p.notify_device_offline) && (
                            <span className="text-xs" title="Dispositif hors ligne">📴</span>
                          )}
                          {isTrue(p.notify_abnormal_flow) && (
                            <span className="text-xs" title="Débit anormal">⚠️</span>
                          )}
                          {isTrue(p.notify_alert_critical) && (
                            <span className="text-xs" title="Alerte critique">🚨</span>
                          )}
                          {!isTrue(p.notify_battery_low) && 
                           !isTrue(p.notify_device_offline) && 
                           !isTrue(p.notify_abnormal_flow) && 
                           !isTrue(p.notify_alert_critical) && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {(() => {
                            const assignedDevice = devices.find(d => d.patient_id === p.id)
                            return assignedDevice ? (
                              <button
                                className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                                onClick={() => handleUnassignDevice(assignedDevice)}
                                disabled={unassigningDevice === assignedDevice.id}
                                title="Désassigner le dispositif du patient"
                              >
                                <span className="text-lg">{unassigningDevice === assignedDevice.id ? '⏳' : '🔌'}</span>
                              </button>
                            ) : null
                          })()}
                          <button
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={() => openEditModal(p)}
                            title="Modifier le patient"
                          >
                            <span className="text-lg">✏️</span>
                          </button>
                          <button
                            className="p-2 hover:bg-red-100 rounded-lg transition-colors"
                            onClick={() => handleDelete(p)}
                            disabled={deleteLoading || devices.some(d => d.patient_id === p.id)}
                            title={devices.some(d => d.patient_id === p.id) ? "Impossible de supprimer un patient avec un dispositif assigné. Désassignez d'abord le dispositif." : "Supprimer le patient"}
                          >
                            <span className="text-lg">{deleteLoading ? '⏳' : '🗑️'}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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
    </div>
  )
}

