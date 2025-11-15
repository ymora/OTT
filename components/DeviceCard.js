'use client'

export default function DeviceCard({ device, delay = 0, onSelect }) {
  const isOnline = () => {
    if (!device.last_seen) return false
    const lastSeen = new Date(device.last_seen)
    const hoursSince = (Date.now() - lastSeen.getTime()) / (1000 * 60 * 60)
    return hoursSince < 2
  }

  const batteryLevel = typeof device.last_battery === 'number' ? device.last_battery : null
  const isAssigned = Boolean(device.patient_id && (device.first_name || device.last_name))

  const batteryColor = (level) => {
    if (level === null) return 'text-gray-400'
    if (level > 60) return 'text-green-600'
    if (level > 20) return 'text-orange-600'
    return 'text-red-600'
  }

  return (
    <div 
      className="card group hover:scale-102 cursor-pointer animate-scale-in"
      style={{animationDelay: `${delay}s`}}
      onClick={() => onSelect?.(device)}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
    >
      {/* Status badge */}
      <div className="flex items-center justify-between mb-3">
        <div className={`flex items-center gap-2 ${isOnline() ? 'text-green-600' : 'text-gray-400'}`}>
          <div className={`w-2 h-2 rounded-full ${isOnline() ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
          <span className="text-xs font-medium">{isOnline() ? 'En ligne' : 'Hors ligne'}</span>
        </div>
        <span className={`text-2xl ${batteryColor(batteryLevel)}`}>
          🔋 {batteryLevel !== null ? `${batteryLevel.toFixed(0)}%` : 'N/A'}
        </span>
      </div>

      {/* Device info */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 group-hover:text-primary-600 transition-colors">
          {device.device_name || `OTT-${device.sim_iccid?.substr(-8)}`}
        </h3>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            isAssigned ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-amber-50 text-amber-700 border border-amber-100'
          }`}
        >
          {isAssigned ? 'Assigné' : 'Non assigné'}
        </span>
      </div>

      {isAssigned ? (
        <p className="text-sm text-gray-600 mb-2">
          👤 {device.first_name} {device.last_name}
        </p>
      ) : (
        <p className="text-sm text-amber-600 mb-2">👤 Aucun patient associé</p>
      )}

      <p className="text-xs text-gray-500">
        📍 {device.city || 'Non localisé'} | 👁️ {device.last_seen ? new Date(device.last_seen).toLocaleString('fr-FR') : 'n/a'}
      </p>
    </div>
  )
}

