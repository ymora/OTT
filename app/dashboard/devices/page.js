'use client'

import { useEffect, useState } from 'react'
import DeviceCard from '@/components/DeviceCard'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

export default function DevicesPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      setError(null)
      const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/devices')
      setDevices(data.devices || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredDevices = devices.filter(d => 
    d.device_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.sim_iccid?.includes(searchTerm) ||
    `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dispositifs OTT</h1>
          <p className="text-gray-600 mt-1">{devices.length} dispositif(s) total</p>
        </div>
      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}
        <button className="btn-primary">
          ➕ Nouveau Dispositif
        </button>
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
            <DeviceCard key={device.id} device={device} delay={i * 0.03} />
          ))}
        </div>
      )}

      {filteredDevices.length === 0 && !loading && (
        <div className="card text-center py-12">
          <p className="text-gray-500">Aucun dispositif trouvé</p>
        </div>
      )}
    </div>
  )
}

