'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import SearchBar from '@/components/SearchBar'
import UserModal from '@/components/UserModal'

export default function PatientsPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [success, setSuccess] = useState('')
  const [actionError, setActionError] = useState('')
  
  const { data, loading, error, refetch } = useApiData([
    '/api.php/patients'
  ], { requiresAuth: true })
  
  console.log('Data structure:', data) // Debug
  const allPatients = Array.isArray(data?.patients) ? data.patients : []
  const rooms = data?.rooms || []
  
  const filteredPatients = useMemo(() => {
    if (!searchTerm) return allPatients
    
    const needle = searchTerm.toLowerCase()
    return allPatients.filter(patient => {
      const haystack = `${patient.first_name || ''} ${patient.last_name || ''} ${patient.email || ''} ${patient.phone || ''} ${patient.city || ''}`.toLowerCase()
      return haystack.includes(needle)
    })
  }, [allPatients, searchTerm])
  
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
    setSuccess('')
    setActionError('')
  }
  
  const resetMessages = () => {
    setSuccess('')
    setActionError('')
  }

  const roleColors = {
    admin: 'bg-purple-100 text-purple-700',
    medecin: 'bg-green-100 text-green-700',
    technicien: 'bg-blue-100 text-blue-700',
  }

  const handleModalSave = async () => {
    try {
      setSuccess(editingItem ? 'Patient modifié avec succès' : 'Patient créé avec succès')
      await new Promise(resolve => setTimeout(resolve, 100))
      await refetch()
    } catch (err) {
      setActionError(err.message || 'Erreur lors de la sauvegarde')
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">👥 Patients</h1>
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher un patient..."
          />
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-primary" onClick={openCreateModal}>
            ➕ Nouveau Patient
          </button>
        </div>
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
                  <th className="text-right py-3 px-4 text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatients.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-500 dark:text-gray-400">
                      {searchTerm 
                        ? 'Aucun patient ne correspond à la recherche' 
                        : 'Aucun patient'}
                    </td>
                  </tr>
                ) : (
                  filteredPatients.map((patient, i) => (
                    <tr 
                      key={patient.id} 
                      className="table-row animate-slide-up hover:bg-gray-50 dark:hover:bg-gray-800"
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="table-cell py-3 px-4 font-medium">
                        {patient.first_name} {patient.last_name}
                      </td>
                      <td className="table-cell">
                        {(patient.date_of_birth || patient.birth_date) ? new Date(patient.date_of_birth || patient.birth_date).toLocaleDateString('fr-FR') : '-'}
                      </td>
                      <td className="table-cell">{patient.email || '-'}</td>
                      <td className="table-cell text-sm">{patient.phone || '-'}</td>
                      <td className="table-cell text-sm">{patient.city || '-'}</td>
                      <td className="table-cell py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEditModal(patient)}
                            className="btn-sm btn-primary"
                            title="Modifier le patient"
                          >
                            ✏️
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

      <UserModal
        isOpen={showModal}
        onClose={closeModal}
        editingItem={editingItem}
        type="patient"
        onSave={handleModalSave}
        roles={[]}
      />

    </div>
  )
}
