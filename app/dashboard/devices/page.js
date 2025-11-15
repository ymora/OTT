'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import DeviceCard from '@/components/DeviceCard'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

export default function DevicesPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [error, setError] = useState(null)
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [assignForm, setAssignForm] = useState({ patient_id: '' })
  const [assignError, setAssignError] = useState(null)
  const [assignLoading, setAssignLoading] = useState(false)

  const loadDevices = useCallback(async () => {
    try {
      setError(null)
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/devices', {}, { requiresAuth: true })
      setDevices(data.devices || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, API_URL])

  const loadPatients = useCallback(async () => {
    try {
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/patients', {}, { requiresAuth: true })
      setPatients(data.patients || [])
    } catch (err) {
      console.error(err)
    }
  }, [fetchWithAuth, API_URL])

  useEffect(() => {
    loadDevices()
    loadPatients()
  }, [loadDevices, loadPatients])

  const filteredDevices = useMemo(() => {
    const needle = searchTerm.toLowerCase()
    return devices.filter(d => {
      const matchesSearch =
        d.device_name?.toLowerCase().includes(needle) ||
        d.sim_iccid?.includes(searchTerm) ||
        `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes(needle)

      const isAssigned = Boolean(d.patient_id)
      const matchesAssignment =
        assignmentFilter === 'all' ||
        (assignmentFilter === 'assigned' && isAssigned) ||
        (assignmentFilter === 'unassigned' && !isAssigned)

      return matchesSearch && matchesAssignment
    })
  }, [devices, searchTerm, assignmentFilter])

  const handleSelectDevice = (device) => {
    setSelectedDevice(device)
    setAssignForm({ patient_id: device.patient_id ? String(device.patient_id) : '' })
    setAssignError(null)
    setAssignModalOpen(true)
  }

  const closeAssignModal = () => {
    if (assignLoading) return
    setAssignModalOpen(false)
    setSelectedDevice(null)
    setAssignError(null)
  }

  const handleAssignSubmit = async (event) => {
    event.preventDefault()
    if (!selectedDevice) return
    setAssignLoading(true)
    setAssignError(null)
    try {
      const payload = {
        patient_id: assignForm.patient_id === '' ? null : parseInt(assignForm.patient_id, 10)
      }
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${selectedDevice.id}`,
        {
          method: 'PUT',
          body: JSON.stringify(payload)
        },
        { requiresAuth: true }
      )
      setAssignModalOpen(false)
      setSelectedDevice(null)
      setAssignForm({ patient_id: '' })
      await loadDevices()
    } catch (err) {
      setAssignError(err.message)
    } finally {
      setAssignLoading(false)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dispositifs OTT</h1>
          <p className="text-gray-600 mt-1">{devices.length} dispositif(s) total</p>
        </div>
        {error && (
          <div className="alert alert-warning w-full">
            <strong>Erreur API :</strong> {error}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'Tous' },
          { id: 'assigned', label: 'Assignés' },
          { id: 'unassigned', label: 'Non assignés' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setAssignmentFilter(tab.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              assignmentFilter === tab.id
                ? 'bg-primary-600 text-white shadow-md scale-105'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="card">
        <input
          type="text"
          placeholder="🔍 Rechercher par nom, patient, ou ICCID..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="input"
        />
      </div>

      {/* Devices Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="card animate-shimmer h-40"></div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDevices.map((device, i) => (
            <DeviceCard key={device.id} device={device} delay={i * 0.03} onSelect={handleSelectDevice} />
          ))}
        </div>
      )}

      {filteredDevices.length === 0 && !loading && (
        <div className="card text-center py-12">
          <p className="text-gray-500">Aucun dispositif trouvé</p>
        </div>
      )}

      {assignModalOpen && selectedDevice && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Rattacher le dispositif</h2>
                <p className="text-sm text-gray-500">
                  Associer <strong>{selectedDevice.device_name || selectedDevice.sim_iccid}</strong> à un patient
                </p>
              </div>
              <button className="text-gray-500 hover:text-gray-700" onClick={closeAssignModal} disabled={assignLoading}>
                ✕
              </button>
            </div>
            <form className="space-y-4" onSubmit={handleAssignSubmit}>
              <label className="text-sm font-medium text-gray-700 w-full">
                Patient
                <select
                  className="input mt-1"
                  value={assignForm.patient_id}
                  onChange={(e) => setAssignForm({ patient_id: e.target.value })}
                >
                  <option value="">— Aucun patient —</option>
                  {patients.map(patient => (
                    <option key={patient.id} value={patient.id}>
                      {patient.last_name.toUpperCase()} {patient.first_name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-sm text-gray-600">
                <p>ICCID : <span className="font-mono">{selectedDevice.sim_iccid}</span></p>
                {selectedDevice.last_seen && (
                  <p>Dernier contact : {new Date(selectedDevice.last_seen).toLocaleString('fr-FR')}</p>
                )}
              </div>

              {assignError && (
                <div className="alert alert-error">
                  <strong>Erreur :</strong> {assignError}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button type="button" className="btn-secondary" onClick={closeAssignModal} disabled={assignLoading}>
                  Annuler
                </button>
                <button type="submit" className="btn-primary" disabled={assignLoading}>
                  {assignLoading ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

