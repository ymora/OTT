'use client'

import dynamic from 'next/dynamic'
import { Suspense, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useSearchParams } from 'next/navigation'

const LeafletMap = dynamic(() => import('@/components/LeafletMap'), { ssr: false })

function MapViewer({ devices }) {
  const searchParams = useSearchParams()
  return (
    <LeafletMap
      devices={devices.filter(d => d.latitude && d.longitude)}
      focusDeviceId={searchParams.get('deviceId')}
    />
  )
}

export default function MapPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadDevices = async () => {
      try {
        setError(null)
        const data = await fetchJson(fetchWithAuth, API_URL, '/api.php/devices')
        setDevices(data.devices || [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadDevices()
  }, [fetchWithAuth, API_URL])

  if (loading) {
    return (
      <div className="card animate-shimmer h-[600px]" />
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">🗺️ Carte des Dispositifs</h1>
          <p className="text-gray-600 mt-1">
            Visualisation en direct des dispositifs (positions, batterie, statut transmission)
          </p>
        </div>
        <span className="text-sm text-gray-500">{devices.length} dispositif(s)</span>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        <Suspense fallback={<div className="card animate-shimmer h-[600px]" />}>
          <MapViewer devices={devices} />
        </Suspense>
      </div>
    </div>
  )
}
