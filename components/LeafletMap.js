'use client'

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useMemo, useEffect, useState, useRef } from 'react'
import { useGeolocation } from '@/hooks/useGeolocation'

const statusColors = {
  online: '#22c55e',
  warning: '#f97316',
  offline: '#ef4444'
}

const statusBadges = {
  online: 'text-green-700 bg-green-50 border-green-100',
  warning: 'text-amber-700 bg-amber-50 border-amber-100',
  offline: 'text-red-700 bg-red-50 border-red-100'
}

const ONLINE_THRESHOLD_HOURS = 2
const WARNING_THRESHOLD_HOURS = 6

function buildIcon(device, status = 'online') {
  const color = statusColors[status] || statusColors.online
  const size = 18
  const borderSize = 3
  const shadowSize = 8
  
  // Déterminer l'icône en fonction du statut du dispositif
  let icon = '📍'
  let iconColor = color
  
  // Vérifier la batterie
  const battery = device.last_battery
  if (battery !== null && battery !== undefined) {
    if (battery < 20) {
      icon = '🔴' // Batterie critique
      iconColor = '#ef4444'
    } else if (battery < 30) {
      icon = '🟠' // Batterie faible
      iconColor = '#f97316'
    } else if (battery >= 80) {
      icon = '🟢' // Batterie pleine
      iconColor = '#22c55e'
    } else {
      icon = '🔋' // Batterie OK
      iconColor = '#22c55e'
    }
  }
  
  // Si le dispositif a des alertes non résolues, priorité à l'icône d'alerte
  if (device.unresolved_alerts_count > 0) {
    icon = '⚠️'
    iconColor = '#f97316'
  }
  
  // Créer un label court pour identifier le dispositif
  const label = device.device_name 
    ? device.device_name.split('-').pop()?.substring(0, 3) || device.id?.toString().slice(-2) || ''
    : device.id?.toString().slice(-2) || ''
  
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div class="marker-container" style="
        position: relative;
        width: ${size + borderSize * 2 + 10}px;
        height: ${size + borderSize * 2 + 10}px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      ">
        <!-- Icône principale -->
        <div class="marker-icon" style="
          font-size: ${size + 4}px;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        transition: all 0.3s ease;
        position: relative;
        z-index: 2;
        ">${icon}</div>
        
        <!-- Label avec nom du dispositif -->
        ${label ? `
        <div class="marker-label" style="
          position: absolute;
          bottom: -18px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          color: ${iconColor};
          font-size: 9px;
          font-weight: bold;
          padding: 2px 5px;
          border-radius: 8px;
          border: 1px solid ${iconColor};
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          z-index: 3;
          white-space: nowrap;
        ">${label}</div>
        ` : ''}
      </div>
      
      <style>
        .marker-container:hover .marker-icon {
          transform: scale(1.3);
        }
        .marker-container:hover .marker-label {
          font-size: 10px;
          padding: 3px 6px;
        }
      </style>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 35]
  })
}

function hoursSince(timestamp) {
  if (!timestamp) return Number.POSITIVE_INFINITY
  const last = new Date(timestamp).getTime()
  if (Number.isNaN(last)) return Number.POSITIVE_INFINITY
  return (Date.now() - last) / (1000 * 60 * 60)
}

function computeConnectionStatus(device) {
  const hours = hoursSince(device.last_seen)
  if (!Number.isFinite(hours)) {
    return { status: 'offline', label: 'Jamais vu', lastSeenLabel: 'Jamais' }
  }
  if (hours < ONLINE_THRESHOLD_HOURS) {
    return {
      status: 'online',
      label: 'En ligne',
      lastSeenLabel: new Date(device.last_seen).toLocaleString('fr-FR')
    }
  }
  if (hours < WARNING_THRESHOLD_HOURS) {
    return {
      status: 'warning',
      label: 'Inactif récent',
      lastSeenLabel: new Date(device.last_seen).toLocaleString('fr-FR')
    }
  }
  return {
    status: 'offline',
    label: 'Hors ligne',
    lastSeenLabel: new Date(device.last_seen).toLocaleString('fr-FR')
  }
}

function computeBatteryMeta(value) {
  if (typeof value !== 'number') {
    return { label: 'N/A', status: 'unknown' }
  }
  if (value < 20) return { label: `${value.toFixed(0)}%`, status: 'critical' }
  if (value < 50) return { label: `${value.toFixed(0)}%`, status: 'low' }
  return { label: `${value.toFixed(0)}%`, status: 'ok' }
}

function DeviceMarkers({ devices, focusDeviceId, onSelect }) {
  const map = useMap()
  const [hoveredDeviceId, setHoveredDeviceId] = useState(null)
  const hoverTimeoutRef = useRef(null)
  
  // Obtenir la géolocalisation du PC (GPS ou IP)
  const { latitude: pcLatitude, longitude: pcLongitude, loading: geoLoading } = useGeolocation()

  // Cleanup du timeout au démontage du composant
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current)
        hoverTimeoutRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (!focusDeviceId || !map) return
    const device = devices.find(d => String(d.id) === String(focusDeviceId))
    if (device && device.latitude && device.longitude) {
      map.flyTo([device.latitude, device.longitude], 9, { duration: 0.8 })
    }
  }, [focusDeviceId, devices, map])

  const enrichedDevices = useMemo(
    () =>
      devices.map(device => {
        const connection = computeConnectionStatus(device)
        const battery = computeBatteryMeta(device.last_battery)
        
        // Si pas de coordonnées, utiliser une position par défaut (centre France) avec un offset pour éviter superposition
        let lat = typeof device.latitude === 'number' ? device.latitude : parseFloat(device.latitude)
        let lng = typeof device.longitude === 'number' ? device.longitude : parseFloat(device.longitude)
        
        // Vérifier que les coordonnées sont valides
        const hasValidCoords = !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng) &&
                               lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
        
        if (!hasValidCoords) {
          // Position par défaut : centre de la France avec offset basé sur l'ID pour éviter superposition
          const baseLat = 46.2276
          const baseLng = 2.2137
          // Créer un offset circulaire pour mieux répartir les dispositifs
          const deviceId = device.id || 0
          const angle = (deviceId * 137.508) % 360 // Angle doré pour répartition uniforme
          const radius = 0.05 + ((deviceId % 5) * 0.02) // Rayon variable
          const rad = (angle * Math.PI) / 180
          lat = baseLat + (radius * Math.cos(rad))
          lng = baseLng + (radius * Math.sin(rad))
        }
        
        return {
          ...device,
          latitude: lat,
          longitude: lng,
          hasRealCoordinates: !!(device.latitude && device.longitude),
          connectionStatus: connection.status,
          connectionLabel: connection.label,
          lastSeenLabel: connection.lastSeenLabel,
          batteryLabel: battery.label,
          batteryStatus: battery.status
        }
      }),
    [devices, pcLatitude, pcLongitude, geoLoading]
  )

  // Mémoriser les icônes pour éviter les re-renders
  const deviceIcons = useMemo(() => {
    const icons = {}
    enrichedDevices.forEach(device => {
      icons[device.id] = buildIcon(device, device.connectionStatus)
    })
    return icons
  }, [enrichedDevices])

  return (
    <>
      {enrichedDevices.map(device => {
        // Vérification finale pour éviter NaN
        const finalLat = typeof device.latitude === 'number' && !isNaN(device.latitude) && isFinite(device.latitude)
          ? device.latitude
          : (pcLatitude && !isNaN(pcLatitude) ? pcLatitude : 46.2276)
        const finalLng = typeof device.longitude === 'number' && !isNaN(device.longitude) && isFinite(device.longitude)
          ? device.longitude
          : (pcLongitude && !isNaN(pcLongitude) ? pcLongitude : 2.2137)
        
        // S'assurer que les coordonnées sont dans les limites valides
        const safeLat = Math.max(-90, Math.min(90, finalLat))
        const safeLng = Math.max(-180, Math.min(180, finalLng))
        
        return (
        <Marker
          key={device.id}
          position={[safeLat, safeLng]}
          icon={deviceIcons[device.id]}
          eventHandlers={{
            click: () => onSelect?.(device),
            mouseover: (e) => {
              // Ajouter la classe hover via le DOM directement (évite le re-render)
              const markerElement = e.target.getElement()
              if (markerElement) {
                markerElement.classList.add('marker-hovered')
              }
              setHoveredDeviceId(device.id)
            },
            mouseout: (e) => {
              // Retirer la classe hover
              const markerElement = e.target.getElement()
              if (markerElement) {
                markerElement.classList.remove('marker-hovered')
              }
              // Délai pour éviter la disparition lors du passage vers le popup
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current)
              }
              hoverTimeoutRef.current = setTimeout(() => setHoveredDeviceId(null), 150)
            }
          }}
        >
          <Popup maxWidth={320}>
            <div className="space-y-2 p-2">
              <div className="flex items-center justify-between gap-2 border-b pb-2">
                <p className="font-semibold text-base">{device.device_name || device.sim_iccid}</p>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full border ${
                    statusBadges[device.connectionStatus] || statusBadges.online
                  }`}
                >
                  {device.connectionLabel}
                </span>
              </div>
              
              {!device.hasRealCoordinates && (
                <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-2">
                  <p className="text-xs text-amber-800 font-medium">
                    ⚠️ Position estimée {!geoLoading && pcLatitude && pcLongitude ? '(basée sur votre localisation)' : '(pas de coordonnées GPS)'}
                  </p>
                </div>
              )}
              
              <div className="space-y-1.5 text-sm">
                {/* Localisation */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">📍 Localisation:</span>
                  <span className="font-medium">{device.city || 'Non localisé'}</span>
                </div>
                
                {/* Batterie */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">🔋 Batterie:</span>
                  <span className={`font-semibold ${
                    device.batteryStatus === 'critical' ? 'text-red-600' :
                    device.batteryStatus === 'low' ? 'text-amber-600' :
                    'text-green-600'
                  }`}>
                    {device.batteryLabel}
                    {device.batteryStatus === 'critical' && ' 🔴'}
                    {device.batteryStatus === 'low' && ' 🟠'}
                  </span>
                </div>
                
                {/* Débit (si disponible) */}
                {device.last_flowrate !== null && device.last_flowrate !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">💨 Débit:</span>
                    <span className="font-medium">{Number(device.last_flowrate).toFixed(2)} L/min</span>
                  </div>
                )}
                
                {/* Firmware */}
                {device.firmware_version && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">💾 Firmware:</span>
                    <span className="font-mono text-xs font-medium">{device.firmware_version}</span>
                  </div>
                )}
                
                {/* Alertes non résolues */}
                {device.unresolved_alerts_count > 0 && (
                  <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded px-2 py-1">
                    <span className="text-orange-700 font-semibold">⚠️ Alertes:</span>
                    <span className="font-bold text-orange-700">{device.unresolved_alerts_count}</span>
                  </div>
                )}
                
                {/* Dernier contact */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">🕒 Dernier contact:</span>
                  <span className="font-medium text-xs">{device.lastSeenLabel}</span>
                </div>
                
                {/* Patient */}
              {device.first_name && (
                  <div className="flex items-center justify-between border-t pt-1.5 mt-1.5">
                    <span className="text-gray-600">👤 Patient:</span>
                    <span className="font-medium">{device.first_name} {device.last_name}</span>
                  </div>
              )}
                
                {device.sim_iccid && (
                  <div className="flex items-center justify-between text-xs text-gray-500 pt-1 border-t">
                    <span>ICCID:</span>
                    <span className="font-mono">{device.sim_iccid}</span>
                  </div>
                )}
                
                {device.firmware_version && (
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>Firmware:</span>
                    <span className="font-mono">{device.firmware_version}</span>
                  </div>
                )}
              </div>
            </div>
          </Popup>
        </Marker>
        )
      })}
    </>
  )
}

export default function LeafletMap({ devices = [], focusDeviceId, onSelect }) {
  // Obtenir la géolocalisation du PC (GPS ou IP) pour le centre de la carte
  const { latitude: pcLatitude, longitude: pcLongitude, loading: geoLoading } = useGeolocation()
  
  // Utiliser un ref pour s'assurer qu'une seule instance de carte existe
  const mapKeyRef = useRef(0)
  const [mapKey, setMapKey] = useState(0)
  
  // Réinitialiser la carte si les devices changent significativement
  useEffect(() => {
    const devicesKey = devices.map(d => `${d.id}-${d.latitude}-${d.longitude}`).join(',')
    if (devicesKey !== mapKeyRef.current) {
      mapKeyRef.current = devicesKey
      setMapKey(prev => prev + 1)
    }
  }, [devices])
  
  const center = useMemo(() => {
    if (devices.length === 0) {
      // Si pas de dispositifs, utiliser les coordonnées du PC si disponibles
      if (!geoLoading && pcLatitude && pcLongitude && 
          !isNaN(pcLatitude) && !isNaN(pcLongitude) &&
          isFinite(pcLatitude) && isFinite(pcLongitude)) {
        return [pcLatitude, pcLongitude]
      }
      return [46.2276, 2.2137] // Centre de la France par défaut
    }
    // Calculer le centre en incluant tous les dispositifs avec coordonnées valides
    const devicesWithCoords = devices.filter(d => {
      const lat = typeof d.latitude === 'number' ? d.latitude : parseFloat(d.latitude)
      const lng = typeof d.longitude === 'number' ? d.longitude : parseFloat(d.longitude)
      return !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng) && 
             lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    })
    
    if (devicesWithCoords.length > 0) {
      // Si on a des coordonnées réelles, utiliser leur moyenne
      const validLats = devicesWithCoords.map(d => {
        const lat = typeof d.latitude === 'number' ? d.latitude : parseFloat(d.latitude)
        return isNaN(lat) ? null : lat
      }).filter(lat => lat !== null)
      
      const validLngs = devicesWithCoords.map(d => {
        const lng = typeof d.longitude === 'number' ? d.longitude : parseFloat(d.longitude)
        return isNaN(lng) ? null : lng
      }).filter(lng => lng !== null)
      
      if (validLats.length > 0 && validLngs.length > 0) {
        const avgLat = validLats.reduce((sum, lat) => sum + lat, 0) / validLats.length
        const avgLng = validLngs.reduce((sum, lng) => sum + lng, 0) / validLngs.length
        // Vérifier que les valeurs finales sont valides
        if (!isNaN(avgLat) && !isNaN(avgLng) && isFinite(avgLat) && isFinite(avgLng)) {
          return [avgLat, avgLng]
        }
      }
    }
    // Si aucun dispositif n'a de coordonnées valides, utiliser les coordonnées du PC si disponibles
    if (!geoLoading && pcLatitude && pcLongitude && 
        !isNaN(pcLatitude) && !isNaN(pcLongitude) &&
        isFinite(pcLatitude) && isFinite(pcLongitude)) {
      return [pcLatitude, pcLongitude]
    }
    // Sinon, centre de la France (où seront positionnés les dispositifs sans coordonnées)
    return [46.2276, 2.2137]
  }, [devices, pcLatitude, pcLongitude, geoLoading])
  
  const zoom = useMemo(() => {
    const devicesWithCoords = devices.filter(d => {
      const lat = typeof d.latitude === 'number' ? d.latitude : parseFloat(d.latitude)
      const lng = typeof d.longitude === 'number' ? d.longitude : parseFloat(d.longitude)
      return !isNaN(lat) && !isNaN(lng) && isFinite(lat) && isFinite(lng) &&
             lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    })
    if (devicesWithCoords.length === 0) return 5.5 // Zoom France entière
    if (devicesWithCoords.length === 1) return 9 // Zoom sur un seul dispositif
    return 6 // Zoom intermédiaire pour plusieurs dispositifs
  }, [devices])

  return (
    <MapContainer 
      key={mapKey}
      center={center} 
      zoom={zoom} 
      style={{ height: 600, width: '100%' }} 
      scrollWheelZoom
      whenCreated={(mapInstance) => {
        // Nettoyer l'instance précédente si elle existe
        if (typeof window !== 'undefined' && window._leafletMapInstance) {
          try {
            window._leafletMapInstance.remove()
          } catch (e) {
            // Ignorer les erreurs de nettoyage
          }
        }
        window._leafletMapInstance = mapInstance
      }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DeviceMarkers devices={devices} focusDeviceId={focusDeviceId} onSelect={onSelect} />
    </MapContainer>
  )
}
