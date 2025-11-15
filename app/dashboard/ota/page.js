'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

export default function OTAPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [firmwares, setFirmwares] = useState([])
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [firmwaresData, devicesData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, '/api.php/firmwares'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/devices')
      ])
      setFirmwares(firmwaresData.firmwares || [])
      setDevices(devicesData.devices || [])
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [API_URL, fetchWithAuth])

  useEffect(() => {
    loadData()
  }, [loadData])

  const triggerOTA = async (deviceId, version) => {
    try {
      setMessage(null)
      await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/devices/${deviceId}/ota`,
        {
          method: 'POST',
          body: JSON.stringify({ firmware_version: version })
        },
        { requiresAuth: false }
      )
      setMessage(`OTA v${version} programmé pour le dispositif #${deviceId}`)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">🔄 Gestion OTA</h1>

      {/* Firmwares */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">📦 Firmwares Disponibles</h2>
          <button className="btn-primary">📤 Upload Firmware</button>
        </div>

        {(error || message) && (
          <div className={`alert ${error ? 'alert-warning' : 'alert-success'} mb-4`}>
            {error ? `Erreur API : ${error}` : message}
          </div>
        )}

        {loading ? (
          <div className="animate-shimmer h-48"></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Version</th>
                  <th className="text-left py-3 px-4">Taille</th>
                  <th className="text-left py-3 px-4">Stable</th>
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {firmwares.map((fw, i) => (
                  <tr key={fw.id} className="border-b hover:bg-gray-50 animate-slide-up" style={{animationDelay: `${i * 0.05}s`}}>
                    <td className="py-3 px-4 font-mono font-bold">v{fw.version}</td>
                    <td className="py-3 px-4">{(fw.file_size / 1024).toFixed(0)} Ko</td>
                    <td className="py-3 px-4">
                      {fw.is_stable ? <span className="badge badge-success">✅ Stable</span> : <span className="badge">Beta</span>}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">{new Date(fw.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => {
                          const deviceId = prompt('ID du dispositif:')
                          if (deviceId) triggerOTA(deviceId, fw.version)
                        }}
                        className="btn-primary text-sm"
                      >
                        Déployer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Configuration Dispositifs */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">⚙️ Configuration Dispositifs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((d, i) => (
            <div key={d.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-all animate-scale-in" style={{animationDelay: `${i * 0.03}s`}}>
              <p className="font-semibold mb-2">{d.device_name || d.sim_iccid?.substr(-8)}</p>
              <p className="text-sm text-gray-600 mb-2">Firmware: v{d.firmware_version || '3.0.0'}</p>
              <button className="btn-secondary w-full text-sm">⚙️ Configurer</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

