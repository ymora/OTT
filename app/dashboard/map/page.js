'use client'

import dynamicImport from 'next/dynamic'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

const LeafletMap = dynamicImport(() => import('@/components/LeafletMap'), { ssr: false })

// Désactiver le pré-rendu statique pour cette page
export const dynamic = 'force-dynamic'

export default function MapPage() {
  const [selectedDevice, setSelectedDevice] = useState(null)
  const searchParams = useSearchParams()

  // Charger les données avec useApiData
  const { data, loading, error } = useApiData(
    '/api.php/devices',
    { requiresAuth: false }
  )

  const devices = data?.devices || []
  
  // Sélectionner le premier dispositif si aucun n'est sélectionné (une seule fois)
  useEffect(() => {
    if (!selectedDevice && devices.length > 0) {
      setSelectedDevice(devices[0])
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devices.length])

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
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-3xl font-bold">🗺️ Carte des Dispositifs</h1>
          <p className="text-gray-600 mt-1">
            Visualisation en direct des dispositifs (positions, batterie, statut transmission)
          </p>
        </div>
        <LoadingSpinner size="lg" text="Chargement de la carte..." />
      </div>
    )
  }

  const mappableDevices = devices // Afficher tous les dispositifs (même sans coordonnées)
  const devicesWithCoords = devices.filter(d => d.latitude && d.longitude)
  const devicesWithoutCoords = devices.filter(d => !d.latitude || !d.longitude)

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">🗺️ Carte des Dispositifs</h1>
          <p className="text-gray-600 mt-1">
            Visualisation en direct des dispositifs (positions, batterie, statut transmission)
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm">
          <span className="text-gray-700 font-medium">{mappableDevices.length} dispositif(s) au total</span>
          {devicesWithCoords.length > 0 && (
            <span className="text-green-600">✓ {devicesWithCoords.length} avec coordonnées GPS</span>
          )}
          {devicesWithoutCoords.length > 0 && (
            <span className="text-amber-600">⚠ {devicesWithoutCoords.length} position estimée</span>
          )}
        </div>
      </div>

      <ErrorMessage error={error} />

      <div className="card p-0 overflow-hidden">
        <Suspense fallback={<LoadingSpinner size="lg" text="Chargement de la carte..." />}>
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
                <p className="text-gray-500">
                  Lat/Lng : {
                    enrichedSelection.latitude && typeof enrichedSelection.latitude === 'number' 
                      ? enrichedSelection.latitude.toFixed(4) 
                      : 'N/A'
                  }, {
                    enrichedSelection.longitude && typeof enrichedSelection.longitude === 'number'
                      ? enrichedSelection.longitude.toFixed(4)
                      : 'N/A'
                  }
                </p>
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
