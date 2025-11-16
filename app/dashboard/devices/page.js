'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Chart from '@/components/Chart'

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false })

export default function DevicesPage() {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const router = useRouter()
  const [devices, setDevices] = useState([])
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [assignmentFilter, setAssignmentFilter] = useState('all')
  const [error, setError] = useState(null)
  
  // Modal détails/journal
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [deviceDetails, setDeviceDetails] = useState(null)
  const [deviceLogs, setDeviceLogs] = useState([])
  const [deviceMeasurements, setDeviceMeasurements] = useState([])
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  
  // Modal assignation
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [assignForm, setAssignForm] = useState({ patient_id: '' })
  const [assignError, setAssignError] = useState(null)
  const [assignLoading, setAssignLoading] = useState(false)
  
  // OTA
  const [otaLoading, setOtaLoading] = useState({})

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

  const handleShowDetails = async (device) => {
    setSelectedDevice(device)
    setShowDetailsModal(true)
    setLoadingDetails(true)
    setDeviceDetails(null)
    setDeviceLogs([])
    setDeviceMeasurements([])
    
    try {
      const [logsData, historyData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, `/api.php/logs?device_id=${device.id}&limit=50`, {}, { requiresAuth: true }).catch(() => ({ logs: [] })),
        fetchJson(fetchWithAuth, API_URL, `/api.php/device/${device.id}`, {}, { requiresAuth: true }).catch(() => ({ measurements: [] }))
      ])
      setDeviceLogs(logsData.logs || [])
      setDeviceMeasurements(historyData.measurements || [])
      setDeviceDetails(device)
    } catch (err) {
      console.error(err)
    } finally {
      setLoadingDetails(false)
    }
  }

  const handleAssign = (device) => {
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
      await fetchJson(
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

  const handleOTA = async (device) => {
    if (!confirm(`Lancer une mise à jour OTA pour ${device.device_name || device.sim_iccid} ?`)) return
    
    setOtaLoading(prev => ({ ...prev, [device.id]: true }))
    try {
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${device.id}/ota`,
        { method: 'POST', body: JSON.stringify({}) },
        { requiresAuth: true }
      )
      alert('Mise à jour OTA lancée avec succès')
      await loadDevices()
    } catch (err) {
      alert(`Erreur OTA: ${err.message}`)
    } finally {
      setOtaLoading(prev => ({ ...prev, [device.id]: false }))
    }
  }

  const getStatusBadge = (device) => {
    if (!device.last_seen) return { label: 'Jamais vu', color: 'bg-gray-100 text-gray-700' }
    const hours = (Date.now() - new Date(device.last_seen).getTime()) / (1000 * 60 * 60)
    if (hours < 2) return { label: 'En ligne', color: 'bg-green-100 text-green-700' }
    if (hours < 6) return { label: 'Inactif', color: 'bg-amber-100 text-amber-700' }
    return { label: 'Hors ligne', color: 'bg-red-100 text-red-700' }
  }

  const getBatteryBadge = (battery) => {
    if (battery === null || battery === undefined) return { label: 'N/A', color: 'text-gray-500' }
    // Convertir en nombre pour s'assurer que c'est un nombre valide
    const batteryNum = typeof battery === 'number' ? battery : parseFloat(battery)
    if (isNaN(batteryNum)) return { label: 'N/A', color: 'text-gray-500' }
    if (batteryNum < 20) return { label: `${batteryNum.toFixed(0)}%`, color: 'text-red-600 font-semibold' }
    if (batteryNum < 50) return { label: `${batteryNum.toFixed(0)}%`, color: 'text-amber-600' }
    return { label: `${batteryNum.toFixed(0)}%`, color: 'text-green-600' }
  }

  const isAdmin = user?.role_name === 'admin'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">🔌 Dispositifs</h1>
          <p className="text-gray-600 mt-1">{devices.length} dispositif(s) total</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

      {/* Carte */}
      {!loading && devices.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="text-lg font-semibold">🗺️ Carte des dispositifs</h2>
          </div>
          <div style={{ height: '400px', width: '100%' }}>
            <LeafletMap
              devices={devices}
              onSelect={(device) => {
                const found = devices.find(d => d.id === device.id)
                if (found) handleShowDetails(found)
              }}
            />
          </div>
        </div>
      )}

      {/* Filtres */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
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
                  ? 'bg-primary-600 text-white shadow-md'
                  : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        <div className="flex-1 max-w-md">
          <input
            type="text"
            placeholder="🔍 Rechercher par nom, patient, ou ICCID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input w-full"
          />
        </div>
      </div>

      {/* Tableau */}
      {loading ? (
        <div className="card animate-shimmer h-64"></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4">Dispositif</th>
                <th className="text-left py-3 px-4">Patient</th>
                <th className="text-left py-3 px-4">Statut</th>
                <th className="text-left py-3 px-4">Batterie</th>
                <th className="text-left py-3 px-4">Dernier contact</th>
                <th className="text-left py-3 px-4">Firmware</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDevices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-500">
                    Aucun dispositif trouvé
                  </td>
                </tr>
              ) : (
                filteredDevices.map((device, i) => {
                  const status = getStatusBadge(device)
                  const battery = getBatteryBadge(device.last_battery)
                  return (
                    <tr 
                      key={device.id} 
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-semibold">{device.device_name || 'Sans nom'}</p>
                          <p className="text-xs text-gray-500 font-mono">{device.sim_iccid}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {device.first_name ? (
                          <div>
                            <p className="font-medium">{device.first_name} {device.last_name}</p>
                            <span className="badge badge-success text-xs">Assigné</span>
                          </div>
                        ) : (
                          <span className="text-sm text-amber-600">Non assigné</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`badge ${status.color}`}>{status.label}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={battery.color}>{battery.label}</span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600">
                        {device.last_seen 
                          ? new Date(device.last_seen).toLocaleString('fr-FR', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })
                          : 'Jamais'}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-sm font-mono">{device.firmware_version || 'N/A'}</span>
                        {device.ota_pending && (
                          <span className="badge badge-warning text-xs ml-2">OTA en attente</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={() => handleShowDetails(device)}
                            title="Voir détails et journal"
                          >
                            <span className="text-lg">👁️</span>
                          </button>
                          <button
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            onClick={() => handleAssign(device)}
                            title="Assigner à un patient"
                          >
                            <span className="text-lg">👤</span>
                          </button>
                          {isAdmin && (
                            <button
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                              onClick={() => handleOTA(device)}
                              disabled={otaLoading[device.id]}
                              title="Lancer mise à jour OTA"
                            >
                              <span className="text-lg">{otaLoading[device.id] ? '⏳' : '🔄'}</span>
                            </button>
                          )}
                          {device.latitude && device.longitude && (
                            <button
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              onClick={() => router.push(`/dashboard/map?deviceId=${device.id}`)}
                              title="Voir sur la carte"
                            >
                              <span className="text-lg">📍</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Détails & Journal */}
      {showDetailsModal && selectedDevice && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-6 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">
                  🔌 {selectedDevice.device_name || selectedDevice.sim_iccid}
                </h2>
                <p className="text-sm text-gray-500">ICCID: {selectedDevice.sim_iccid}</p>
              </div>
              <button
                className="text-gray-500 hover:text-gray-900 text-2xl"
                onClick={() => {
                  setShowDetailsModal(false)
                  setSelectedDevice(null)
                  setDeviceDetails(null)
                  setDeviceLogs([])
                  setDeviceMeasurements([])
                }}
              >
                ✖
              </button>
            </div>

            <div className="p-6 space-y-6">
              {loadingDetails ? (
                <div className="animate-shimmer h-64"></div>
              ) : (
                <>
                  {/* Informations */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="card">
                      <p className="text-sm text-gray-500">Statut</p>
                      <p className="font-semibold text-lg">{getStatusBadge(selectedDevice).label}</p>
                    </div>
                    <div className="card">
                      <p className="text-sm text-gray-500">Batterie</p>
                      <p className={`font-semibold text-lg ${getBatteryBadge(selectedDevice.last_battery).color}`}>
                        {getBatteryBadge(selectedDevice.last_battery).label}
                      </p>
                    </div>
                    <div className="card">
                      <p className="text-sm text-gray-500">Firmware</p>
                      <p className="font-semibold text-lg font-mono">{selectedDevice.firmware_version || 'N/A'}</p>
                    </div>
                  </div>

                  {/* Patient */}
                  {selectedDevice.first_name && (
                    <div className="card">
                      <h3 className="text-lg font-semibold mb-2">👤 Patient assigné</h3>
                      <p className="font-medium">{selectedDevice.first_name} {selectedDevice.last_name}</p>
                    </div>
                  )}

                  {/* Historique - Graphiques */}
                  {deviceMeasurements.length > 0 && (
                    <div className="card">
                      <h3 className="text-lg font-semibold mb-4">📈 Historique (72h)</h3>
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div>
                          <h4 className="text-sm font-medium text-gray-600 mb-2">Débit</h4>
                          <div className="h-48">
                            <Chart data={deviceMeasurements} type="flowrate" />
                          </div>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-600 mb-2">Batterie</h4>
                          <div className="h-48">
                            <Chart data={deviceMeasurements.map(m => ({ ...m, last_battery: m.battery }))} type="battery" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Journal */}
                  <div className="card">
                    <h3 className="text-lg font-semibold mb-4">📝 Journal ({deviceLogs.length})</h3>
                    {deviceLogs.length === 0 ? (
                      <p className="text-gray-500 text-sm">Aucun log disponible</p>
                    ) : (
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {deviceLogs.map((log) => (
                          <div key={log.id} className="border rounded-lg p-3 text-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`badge ${
                                log.level === 'ERROR' ? 'badge-error' :
                                log.level === 'WARN' ? 'badge-warning' :
                                log.level === 'SUCCESS' ? 'badge-success' :
                                'badge-info'
                              }`}>
                                {log.level}
                              </span>
                              <span className="text-xs text-gray-500">
                                {new Date(log.timestamp).toLocaleString('fr-FR')}
                              </span>
                            </div>
                            <p className="font-medium text-gray-900">{log.event_type}</p>
                            <p className="text-gray-600 mt-1">{log.message}</p>
                            {log.details && (
                              <pre className="text-xs text-gray-500 mt-2 bg-gray-50 p-2 rounded overflow-x-auto">
                                {JSON.stringify(log.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Assignation */}
      {assignModalOpen && selectedDevice && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold">Rattacher le dispositif</h2>
                <p className="text-sm text-gray-500">
                  {selectedDevice.device_name || selectedDevice.sim_iccid}
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
