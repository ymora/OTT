'use client'

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useMemo } from 'react'

const statusColors = {
  online: '#22c55e',
  warning: '#f97316',
  offline: '#ef4444'
}

function buildIcon(status = 'online') {
  const color = statusColors[status] || statusColors.online
  return L.divIcon({
    className: 'custom-marker',
    html: 
      <div style="
        background:;
        width:14px;
        height:14px;
        border-radius:50%;
        border:3px solid white;
        box-shadow:0 0 8px rgba(0,0,0,0.3);
      "></div>
    ,
    iconSize: [20, 20],
    iconAnchor: [10, 20]
  })
}

export default function LeafletMap({ devices = [] }) {
  const center = useMemo(() => {
    if (devices.length === 0) {
      return [46.2276, 2.2137] // Centre France
    }
    const avgLat = devices.reduce((sum, d) => sum + (d.latitude || 0), 0) / devices.length
    const avgLng = devices.reduce((sum, d) => sum + (d.longitude || 0), 0) / devices.length
    return [avgLat, avgLng]
  }, [devices])

  return (
    <MapContainer center={center} zoom={5.5} style={{ height: 600, width: '100%' }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {devices.map(device => (
        <Marker
          key={device.id}
          position={[device.latitude, device.longitude]}
          icon={buildIcon(device.status)}
        >
          <Popup>
            <div className="space-y-1">
              <p className="font-semibold">{device.device_name}</p>
              <p className="text-sm text-gray-600">{device.city || 'Ville inconnue'}</p>
              <p className="text-sm">Batterie: {device.last_battery}%</p>
              <p className="text-sm">Signal: {device.status}</p>
              {device.first_name && (
                <p className="text-sm">Patient: {device.first_name} {device.last_name}</p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
