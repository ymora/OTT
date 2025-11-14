'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import Chart from '@/components/Chart'

export default function HistoryPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [measurements, setMeasurements] = useState([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadDevices = async () => {
      try {
        setError(null)
        const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/devices')
        const list = data.devices || []
        setDevices(list)
        if (list.length > 0) {
          setSelectedDevice(list[0].id)
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoadingDevices(false)
      }
    }
    loadDevices()
  }, [fetchWithAuth, API_URL])

  useEffect(() => {
    if (!selectedDevice) return
    const loadHistory = async () => {
      try {
        setLoadingHistory(true)
        const data = await fetchJson(fetchWithAuth, API_URL, `/api.php/device/${selectedDevice}`)
        setMeasurements(data.measurements || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoadingHistory(false)
      }
    }
    loadHistory()
  }, [selectedDevice, fetchWithAuth, API_URL])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">📋 Historique</h1>
          <p className="text-gray-600 mt-1">Analyse détaillée des mesures par dispositif</p>
        </div>
        <div className="w-full md:w-64">
          <label className="block text-sm font-medium text-gray-700 mb-2">Dispositif</label>
          <select
            value={selectedDevice || ''}
            onChange={e => setSelectedDevice(e.target.value)}
            className="input"
            disabled={loadingDevices || devices.length === 0}
          >
            {devices.map(device => (
              <option key={device.id} value={device.id}>
                {device.device_name || device.sim_iccid}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur :</strong> {error}
        </div>
      )}

      {loadingDevices || loadingHistory ? (
        <div className="card animate-shimmer h-64"></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">📈 Débit (72h)</h2>
            <Chart data={measurements} type="flowrate" />
          </div>
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">🔋 Batterie</h2>
            <Chart data={measurements.map(m => ({ ...m, last_battery: m.battery }))} type="battery" />
          </div>
        </div>
      )}
    </div>
  )
}

