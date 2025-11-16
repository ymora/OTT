'use client'

import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useMemo, useEffect } from 'react'

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

function buildIcon(status = 'online', deviceId = null, deviceName = null, isHovered = false) {
  const color = statusColors[status] || statusColors.online
  const size = isHovered ? 18 : 14
  const borderSize = isHovered ? 4 : 3
  const shadowSize = isHovered ? 12 : 8
  const pulseClass = isHovered ? 'marker-pulse' : ''
  
  // Créer un label court pour identifier le dispositif
  const label = deviceName 
    ? deviceName.split('-').pop()?.substring(0, 3) || deviceId?.toString().slice(-2) || ''
    : deviceId?.toString().slice(-2) || ''
  
  return L.divIcon({
    className: `custom-marker ${pulseClass}`,
    html: `
      <div class="marker-container" style="
        position: relative;
        width: ${size + borderSize * 2}px;
        height: ${size + borderSize * 2}px;
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="
          background:${color};
          width:${size}px;
          height:${size}px;
          border-radius:50%;
          border:${borderSize}px solid white;
          box-shadow:0 0 ${shadowSize}px rgba(0,0,0,0.4);
          transition: all 0.3s ease;
          position: relative;
          z-index: 2;
        "></div>
        ${label ? `
        <div style="
          position: absolute;
          top: -8px;
          right: -8px;
          background: white;
          color: ${color};
          font-size: 10px;
          font-weight: bold;
          padding: 2px 4px;
          border-radius: 8px;
          border: 1px solid ${color};
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
          z-index: 3;
          min-width: 16px;
          text-align: center;
        ">${label}</div>
        ` : ''}
      </div>
    `,
    iconSize: [isHovered ? 30 : 26, isHovered ? 30 : 26],
    iconAnchor: [isHovered ? 15 : 13, isHovered ? 30 : 26]
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
    [devices]
  )

  return (
    <>
      {enrichedDevices.map(device => {
        const isHovered = hoveredDeviceId === device.id
        return (
          <Marker
            key={device.id}
            position={[device.latitude, device.longitude]}
            icon={buildIcon(device.connectionStatus, device.id, device.device_name, isHovered)}
            eventHandlers={{
              click: () => onSelect?.(device),
              mouseover: () => setHoveredDeviceId(device.id),
              mouseout: () => setHoveredDeviceId(null)
            }}
          >
          <Popup maxWidth={280}>
            <div className="space-y-2 p-1">
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
                  <p className="text-xs text-amber-800 font-medium">⚠️ Position estimée (pas de coordonnées GPS)</p>
                </div>
              )}
              
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">📍 Localisation:</span>
                  <span className="font-medium">{device.city || 'Non localisé'}</span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">🔋 Batterie:</span>
                  <span className={`font-semibold ${
                    device.batteryStatus === 'critical' ? 'text-red-600' :
                    device.batteryStatus === 'low' ? 'text-amber-600' :
                    'text-green-600'
                  }`}>
                    {device.batteryLabel}
                    {device.batteryStatus === 'critical' && ' ⚠️'}
                    {device.batteryStatus === 'low' && ' ⚡'}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">🕒 Dernier contact:</span>
                  <span className="font-medium text-xs">{device.lastSeenLabel}</span>
                </div>
                
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
  const center = useMemo(() => {
    if (devices.length === 0) {
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
    // Sinon, centre de la France (où seront positionnés les dispositifs sans coordonnées)
    return [46.2276, 2.2137]
  }, [devices])
  
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
    <MapContainer center={center} zoom={zoom} style={{ height: 600, width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <DeviceMarkers devices={devices} focusDeviceId={focusDeviceId} onSelect={onSelect} />
    </MapContainer>
  )
}
