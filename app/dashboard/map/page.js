'use client'

import dynamic from 'next/dynamic'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useSearchParams } from 'next/navigation'

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false })

export default function MapPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedDevice, setSelectedDevice] = useState(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    const loadDevices = async () => {
      try {
        setError(null)
        const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/devices')
        const list = data.devices || []
        setDevices(list)
        if (!selectedDevice && list.length) {
          setSelectedDevice(list[0])
        }
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadDevices()
  }, [fetchWithAuth, API_URL, selectedDevice])

  const focusDeviceId = searchParams.get('deviceId')

  const enrichedSelection = useMemo(() => {
    if (!selectedDevice) return null
    return {
      ...selectedDevice,
      city: selectedDevice.city || 'Localisation inconnue'
    }
  }, [selectedDevice])

  if (loading) {
    return (
      <div className="card animate-shimmer h-[600px]" />
    )
  }

  const mappableDevices = devices.filter(d => d.latitude && d.longitude)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">🗺️ Carte des Dispositifs</h1>
          <p className="text-gray-600 mt-1">
            Visualisation en direct des dispositifs (positions, batterie, statut transmission)
          </p>
        </div>
        <span className="text-sm text-gray-500">{mappableDevices.length} dispositif(s) localisés</span>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <Suspense fallback={<div className="card animate-shimmer h-[600px]" />}>
          <LeafletMap
            devices={mappableDevices}
            focusDeviceId={focusDeviceId}
            onSelect={setSelectedDevice}
          />
        </Suspense>
      </div>

      <div className="card">
        {enrichedSelection ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-xl font-semibold">{enrichedSelection.device_name || enrichedSelection.sim_iccid}</h2>
                <p className="text-sm text-gray-500">ICCID&nbsp;: {enrichedSelection.sim_iccid}</p>
              </div>
              <span className="text-sm font-medium text-gray-600">
                {enrichedSelection.first_name
                  ? `Patient : ${enrichedSelection.first_name} ${enrichedSelection.last_name || ''}`
                  : 'Aucun patient assigné'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase">Localisation</p>
                <p className="font-semibold">{enrichedSelection.city}</p>
                <p className="text-gray-500">Lat/Lng : {enrichedSelection.latitude?.toFixed(4)}, {enrichedSelection.longitude?.toFixed(4)}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase">Batterie</p>
                <p className="font-semibold">{typeof enrichedSelection.last_battery === 'number' ? `${enrichedSelection.last_battery.toFixed(0)}%` : 'N/A'}</p>
                <p className="text-gray-500">Dernier contact : {enrichedSelection.last_seen ? new Date(enrichedSelection.last_seen).toLocaleString('fr-FR') : 'Jamais'}</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs text-gray-500 uppercase">Statut</p>
                <p className="font-semibold capitalize">{enrichedSelection.status || 'Inconnu'}</p>
                <p className="text-gray-500">Firmware : {enrichedSelection.firmware_version || 'n/a'}</p>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Cliquez sur un dispositif sur la carte pour afficher les détails.</p>
        )}
      </div>
    </div>
  )
}
