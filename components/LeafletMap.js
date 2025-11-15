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

function buildIcon(status = 'online') {
  const color = statusColors[status] || statusColors.online
  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background:${color};
        width:14px;
        height:14px;
        border-radius:50%;
        border:3px solid white;
        box-shadow:0 0 8px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 20]
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
        return {
          ...device,
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
      {enrichedDevices.map(device => (
        <Marker
          key={device.id}
          position={[device.latitude, device.longitude]}
          icon={buildIcon(device.connectionStatus)}
          eventHandlers={{
            click: () => onSelect?.(device)
          }}
        >
          <Popup>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">{device.device_name || device.sim_iccid}</p>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    statusBadges[device.connectionStatus] || statusBadges.online
                  }`}
                >
                  {device.connectionLabel}
                </span>
              </div>
              <p className="text-xs text-gray-600">{device.city || 'Localisation inconnue'}</p>
              <p className="text-sm">
                🔋 Batterie&nbsp;: {device.batteryLabel}{' '}
                {device.batteryStatus === 'critical' && <span className="text-red-600 font-semibold">(critique)</span>}
                {device.batteryStatus === 'low' && <span className="text-amber-600 font-semibold">(basse)</span>}
              </p>
              <p className="text-sm">🕒 Dernier contact&nbsp;: {device.lastSeenLabel}</p>
              {device.first_name && (
                <p className="text-sm text-gray-700">
                  👤 {device.first_name} {device.last_name}
                </p>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </>
  )
}

export default function LeafletMap({ devices = [], focusDeviceId, onSelect }) {
  const center = useMemo(() => {
    if (devices.length === 0) {
      return [46.2276, 2.2137]
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
      <DeviceMarkers devices={devices} focusDeviceId={focusDeviceId} onSelect={onSelect} />
    </MapContainer>
  )
}
