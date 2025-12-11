'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import dynamicImport from 'next/dynamic'
import { useApiData, useAutoRefresh } from '@/hooks'
import { useUsb } from '@/contexts/UsbContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

// Lazy load de la carte pour accélérer le chargement
const LeafletMap = dynamicImport(() => import('@/components/LeafletMap'), { ssr: false })

export default function DashboardPage() {
  const { isConnected, usbVirtualDevice, usbDeviceInfo, usbStreamLastMeasurement } = useUsb()
  
  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    [
      '/api.php/devices',
      '/api.php/alerts',
      '/api.php/users',
      '/api.php/patients',
      '/api.php/firmwares'
    ],
    { requiresAuth: true }
  )
  
  const [focusDeviceId, setFocusDeviceId] = useState(null)
  
  // États pour les accordéons des KPIs
  const [kpiAccordions, setKpiAccordions] = useState({
    devices: false,
    online: false,
    alerts: false,
    battery: false,
    alertsAction: false,
    batteryAction: false,
    unassigned: false
  })
  
  const toggleAccordion = (key) => {
    setKpiAccordions(prev => ({
      ...prev,
      [key]: !prev[key]
    }))
  }
  
  const zoomToDevice = (deviceId) => {
    setFocusDeviceId(deviceId)
    // Scroll vers la carte
    document.querySelector('#map-container')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  // Utiliser le hook useAutoRefresh pour le rafraîchissement automatique
  useAutoRefresh(refetch, 30000)

  // Mémoriser les données pour éviter les re-renders inutiles
  const devicesFromDb = useMemo(() => data?.devices?.devices || [], [data?.devices])
  
  // Ajouter le dispositif USB virtuel s'il existe et n'est pas déjà dans la liste
  const devices = useMemo(() => {
    if (!usbVirtualDevice) return devicesFromDb
    
    // Vérifier si le dispositif USB est déjà dans la liste
    const alreadyInList = devicesFromDb.find(d => 
      d.sim_iccid === usbVirtualDevice.sim_iccid || 
      d.device_serial === usbVirtualDevice.device_serial
    )
    
    if (alreadyInList) return devicesFromDb
    
    // Ajouter le dispositif virtuel au début de la liste
    return [usbVirtualDevice, ...devicesFromDb]
  }, [devicesFromDb, usbVirtualDevice])
  const alerts = useMemo(() => {
    return (data?.alerts?.alerts || []).filter(a => a.status === 'unresolved')
  }, [data?.alerts])

  // Mémoriser les calculs coûteux pour éviter les recalculs inutiles
  const stats = useMemo(() => {
    // Compter les dispositifs en ligne depuis la base de données (last_seen < 2h)
    const onlineFromDb = devices.filter(d => {
      // Exclure les dispositifs archivés
      if (d.deleted_at) return false
      // Gérer les valeurs null, undefined ou invalides
      if (!d.last_seen) return false
      const lastSeen = new Date(d.last_seen)
      // Vérifier que la date est valide
      if (isNaN(lastSeen.getTime())) return false
      const hoursSince = (new Date() - lastSeen) / (1000 * 60 * 60)
      return hoursSince < 2
    })
    
    // Vérifier si un dispositif USB est connecté et n'est pas déjà compté
    const usbDeviceOnline = isConnected && usbDeviceInfo && (
      usbDeviceInfo.sim_iccid || usbDeviceInfo.device_serial
    )
    
    // Si un dispositif USB est connecté, vérifier s'il est déjà dans la liste des dispositifs en ligne
    let usbDeviceAlreadyCounted = false
    if (usbDeviceOnline) {
      usbDeviceAlreadyCounted = onlineFromDb.some(d => 
        (usbDeviceInfo.sim_iccid && d.sim_iccid === usbDeviceInfo.sim_iccid) ||
        (usbDeviceInfo.device_serial && d.device_serial === usbDeviceInfo.device_serial)
      )
    }
    
    // Ajouter 1 si un dispositif USB est connecté et pas déjà compté
    const activeDevices = onlineFromDb.length + (usbDeviceOnline && !usbDeviceAlreadyCounted ? 1 : 0)
    
    // Calculer les batteries faibles depuis la base de données (exclure archivés)
    const lowBatteryFromDb = devices.filter(d => {
      if (d.deleted_at) return false
      const battery = d.last_battery
      return battery !== null && battery !== undefined && battery < 30
    }).length
    
    // Vérifier si le dispositif USB connecté a une batterie faible
    let usbBatteryLow = false
    let usbBatteryOk = false
    if (usbDeviceOnline && usbDeviceInfo) {
      // Priorité : usbStreamLastMeasurement (le plus récent) > usbDeviceInfo
      const usbBattery = usbStreamLastMeasurement?.battery ?? usbDeviceInfo.battery ?? usbDeviceInfo.last_battery
      if (usbBattery !== null && usbBattery !== undefined) {
        usbBatteryLow = usbBattery < 30
        usbBatteryOk = usbBattery >= 30
      }
    }
    
    // Compter le dispositif USB seulement s'il n'est pas déjà dans la base de données
    const lowBatteryDevices = lowBatteryFromDb + (usbBatteryLow && !usbDeviceAlreadyCounted ? 1 : 0)
    
    // Calculer le nombre total de dispositifs avec batterie OK (>= 30%) - exclure archivés
    const devicesWithBattery = devices.filter(d => {
      if (d.deleted_at) return false
      const battery = d.last_battery
      return battery !== null && battery !== undefined
    })
    const okBatteryFromDb = devicesWithBattery.filter(d => d.last_battery >= 30).length
    const okBatteryDevices = okBatteryFromDb + (usbBatteryOk && !usbDeviceAlreadyCounted ? 1 : 0)
    
    // Total dispositifs : base de données (exclure archivés) + USB si pas déjà compté
    const activeDevicesFromDb = devices.filter(d => !d.deleted_at)
    const totalDevices = activeDevicesFromDb.length + (usbDeviceOnline && !usbDeviceAlreadyCounted ? 1 : 0)
    
    return {
      totalDevices,
      activeDevices,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      lowBatteryDevices,
      okBatteryDevices
    }
  }, [devices, alerts, isConnected, usbDeviceInfo, usbStreamLastMeasurement])

  const unassignedDevices = useMemo(() => 
    devices.filter(d => !d.deleted_at && !d.first_name && !d.last_name),
    [devices]
  )
  
  const lowBatteryList = useMemo(() => 
    devices.filter(d => {
      if (d.deleted_at) return false
      const battery = d.last_battery
      return battery !== null && battery !== undefined && battery < 30
    }),
    [devices]
  )

  // Limiter à 5 pour l'affichage
  const lowBatteryListDisplay = useMemo(() => 
    lowBatteryList.slice(0, 5),
    [lowBatteryList]
  )

  // Mémoriser la carte des dispositifs (doit être avant le return conditionnel)
  const mapComponent = useMemo(() => {
    const activeDevices = devices.filter(d => !d.deleted_at)
    const geolocatedDevices = activeDevices.filter(d => d.latitude && d.longitude)
    if (loading || activeDevices.length === 0) return null
    return (
      <div id="map-container" className="card p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">🗺️ Carte des Dispositifs</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            {geolocatedDevices.length} dispositif(s) géolocalisé(s)
          </p>
        </div>
        <div style={{ height: '400px', width: '100%', position: 'relative', zIndex: 1 }}>
          <LeafletMap
            devices={devices}
            focusDeviceId={focusDeviceId}
            onSelect={() => {}}
          />
        </div>
      </div>
    )
  }, [devices, loading, focusDeviceId])

  // Mémoriser les dispositifs en ligne
  const onlineDevicesList = useMemo(() => {
    const onlineDevices = devices.filter(d => {
      if (d.deleted_at) return false
      if (!d.last_seen) return false
      const lastSeen = new Date(d.last_seen)
      if (isNaN(lastSeen.getTime())) return false
      const hoursSince = (new Date() - lastSeen) / (1000 * 60 * 60)
      return hoursSince < 2
    })
    return onlineDevices.map(device => (
      <button
        key={device.id}
        onClick={() => zoomToDevice(device.id)}
        className="w-full text-left text-xs px-2 py-1 hover:bg-green-50 dark:hover:bg-green-900/30 rounded transition-colors"
      >
        🟢 {device.device_name || device.sim_iccid}
      </button>
    ))
  }, [devices])

  // Mémoriser les alertes critiques
  const criticalAlertsList = useMemo(() => {
    const devicesMap = new Map(devices.filter(d => !d.deleted_at).map(d => [d.id, d]))
    return alerts.filter(a => a.severity === 'critical').map(alert => {
      const device = devicesMap.get(alert.device_id)
      return device ? (
        <button
          key={alert.id}
          onClick={() => zoomToDevice(device.id)}
          className="w-full text-left text-xs px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
        >
          🔴 {device.device_name || device.sim_iccid}
        </button>
      ) : null
    })
  }, [devices, alerts])

  // Mémoriser la liste des batteries
  const batteryListDisplay = useMemo(() => {
    const batteryList = stats.lowBatteryDevices > 0 
      ? lowBatteryList 
      : devices.filter(d => {
          if (d.deleted_at) return false
          const battery = d.last_battery
          return battery !== null && battery !== undefined && battery >= 30
        })
    return batteryList.map(device => {
      const battery = typeof device.last_battery === 'number' ? device.last_battery : parseFloat(device.last_battery) || 0
      const isLow = battery < 30
      return (
        <button
          key={device.id}
          onClick={() => zoomToDevice(device.id)}
          className={`w-full text-left text-xs px-2 py-1 rounded transition-colors ${
            isLow 
              ? 'hover:bg-orange-50 dark:hover:bg-orange-900/30' 
              : 'hover:bg-green-50 dark:hover:bg-green-900/30'
          }`}
        >
          {battery < 20 ? '🔴' : battery < 30 ? '🟠' : '🟢'} {device.device_name || device.sim_iccid} ({battery.toFixed(0)}%)
        </button>
      )
    })
  }, [stats.lowBatteryDevices, lowBatteryList, devices])

  // Mémoriser les alertes actives
  const activeAlertsList = useMemo(() => {
    const devicesMap = new Map(devices.filter(d => !d.deleted_at).map(d => [d.id, d]))
    return alerts.slice(0, 10).map(alert => {
      const device = devicesMap.get(alert.device_id)
      return device ? (
        <button
          key={alert.id}
          onClick={() => zoomToDevice(device.id)}
          className="w-full text-left text-xs px-2 py-1 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
        >
          {alert.severity === 'critical' ? '🔴' : '🟠'} {device.device_name || device.sim_iccid}
        </button>
      ) : null
    })
  }, [devices, alerts])

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="animate-slide-up">
          <h1 className="text-3xl font-bold text-primary mb-2">Vue d&apos;Ensemble</h1>
          <p className="text-muted">Tableau de bord en temps réel des dispositifs OTT</p>
        </div>
        <LoadingSpinner size="lg" text="Chargement du tableau de bord..." />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-primary mb-2">Vue d&apos;Ensemble</h1>
        <p className="text-muted">Tableau de bord en temps réel des dispositifs OTT</p>
      </div>

      <ErrorMessage error={error} onRetry={refetch} />

      {/* Carte des dispositifs */}
      {mapComponent}

      {/* Stats Cards - Indicateurs clés (KPIs + Non Assignés) - TAILLE RÉDUITE avec accordéons */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {/* Card Dispositifs Totaux */}
        <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-slide-up overflow-hidden">
          <button 
            onClick={() => toggleAccordion('devices')}
            className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Dispositifs</p>
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{stats.totalDevices}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl">🔌</span>
              <span className="text-lg">{kpiAccordions.devices ? '▼' : '▶'}</span>
            </div>
          </button>
          {kpiAccordions.devices && (
            <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
              <div className="space-y-1 mt-2">
                {devices.slice(0, 10).map(device => (
                  <button
                    key={device.id}
                    onClick={() => zoomToDevice(device.id)}
                    className="w-full text-left text-xs px-2 py-1 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded transition-colors"
                  >
                    📍 {device.device_name || device.sim_iccid}
                  </button>
                ))}
                {devices.length > 10 && (
                  <div className="text-xs text-gray-500 italic px-2">+{devices.length - 10} autres...</div>
                )}
              </div>
            </div>
          )}
        </div>
        
        {/* Card En Ligne */}
        <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-slide-up overflow-hidden" style={{animationDelay: '0.1s'}}>
          <button 
            onClick={() => toggleAccordion('online')}
            className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">En Ligne</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.activeDevices}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl">🟢</span>
              <span className="text-lg">{kpiAccordions.online ? '▼' : '▶'}</span>
            </div>
          </button>
          {kpiAccordions.online && (
            <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
              <div className="space-y-1 mt-2">
                {onlineDevicesList}
                </div>
              </div>
            )}
        </div>
        
        {/* Card Alertes Critiques */}
        <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-slide-up overflow-hidden" style={{animationDelay: '0.2s'}}>
          <button 
            onClick={() => toggleAccordion('alerts')}
            className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Alertes</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.criticalAlerts}</p>
                          </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl">⚠️</span>
              <span className="text-lg">{kpiAccordions.alerts ? '▼' : '▶'}</span>
                    </div>
          </button>
          {kpiAccordions.alerts && (
            <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
              <div className="space-y-1 mt-2">
                {criticalAlertsList}
              </div>
                  </div>
                )}
        </div>
        
        {/* Card Batteries */}
        <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-slide-up overflow-hidden" style={{animationDelay: '0.3s'}}>
          <button 
            onClick={() => toggleAccordion('battery')}
            className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Batterie</p>
              <p className={`text-2xl font-bold ${stats.lowBatteryDevices > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                {stats.lowBatteryDevices > 0 ? stats.lowBatteryDevices : stats.okBatteryDevices}
                          </p>
                        </div>
            <div className="flex items-center gap-2">
              <span className="text-3xl">🔋</span>
              <span className="text-lg">{kpiAccordions.battery ? '▼' : '▶'}</span>
            </div>
          </button>
          {kpiAccordions.battery && (
            <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
              <div className="space-y-1 mt-2">
                {batteryListDisplay}
              </div>
                  </div>
                )}
        </div>
        
        {/* Card Non Assignés - alignée avec les KPIs */}
        {unassignedDevices.length > 0 && (
          <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 animate-slide-up overflow-hidden" style={{animationDelay: '0.4s'}}>
            <button 
              onClick={() => toggleAccordion('unassigned')}
              className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <div>
                <p className="text-xs text-gray-600 dark:text-gray-400">Non Assignés</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{unassignedDevices.length}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl">📦</span>
                <span className="text-lg">{kpiAccordions.unassigned ? '▼' : '▶'}</span>
              </div>
            </button>
            {kpiAccordions.unassigned && (
              <div className="px-3 pb-3 border-t border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
                <div className="space-y-1 mt-2">
                  {unassignedDevices.slice(0, 10).map(device => (
                    <button
                      key={device.id}
                      onClick={() => zoomToDevice(device.id)}
                      className="w-full text-left text-xs px-2 py-1 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded transition-colors"
                    >
                      📦 {device.device_name || device.sim_iccid}
                    </button>
                  ))}
                  {unassignedDevices.length > 10 && (
                    <div className="text-xs text-gray-500 italic px-2">+{unassignedDevices.length - 10} autres...</div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        </div>

      {/* Actions Requises - Alertes et Batteries uniquement */}
      {(alerts.length > 0 || lowBatteryList.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
          {/* Card Alertes Actives */}
          {alerts.length > 0 && (
            <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm border-2 border-red-300 dark:border-red-700 animate-slide-up overflow-hidden">
              <button
                onClick={() => toggleAccordion('alertsAction')}
                className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Alertes Actives</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{alerts.length}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl">🔔</span>
                  <span className="text-lg">{kpiAccordions.alertsAction ? '▼' : '▶'}</span>
                </div>
              </button>
              {kpiAccordions.alertsAction && (
                <div className="px-3 pb-3 border-t border-red-200 dark:border-red-800 max-h-40 overflow-y-auto">
                  <div className="space-y-1 mt-2">
                    {activeAlertsList}
                    {alerts.length > 10 && (
                      <div className="text-xs text-gray-500 italic px-2">+{alerts.length - 10} autres...</div>
                    )}
          </div>
        </div>
              )}
            </div>
          )}

          {/* Card Batteries Faibles */}
          {lowBatteryList.length > 0 && (
            <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm border-2 border-orange-300 dark:border-orange-700 animate-slide-up overflow-hidden">
              <button 
                onClick={() => toggleAccordion('batteryAction')}
                className="w-full p-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Batteries Faibles</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{lowBatteryList.length}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-3xl">🔋</span>
                  <span className="text-lg">{kpiAccordions.batteryAction ? '▼' : '▶'}</span>
                </div>
              </button>
              {kpiAccordions.batteryAction && (
                <div className="px-3 pb-3 border-t border-orange-200 dark:border-orange-800 max-h-40 overflow-y-auto">
                  <div className="space-y-1 mt-2">
                    {lowBatteryListDisplay.map(device => {
                      const battery = typeof device.last_battery === 'number' ? device.last_battery : parseFloat(device.last_battery) || 0
                      return (
                        <button
                          key={device.id}
                          onClick={() => zoomToDevice(device.id)}
                          className="w-full text-left text-xs px-2 py-1 hover:bg-orange-50 dark:hover:bg-orange-900/30 rounded transition-colors"
                        >
                          {battery < 20 ? '🔴' : '🟠'} {device.device_name || device.sim_iccid}: {battery.toFixed(0)}%
                        </button>
                      )
                    })}
                    {lowBatteryList.length > 5 && (
                      <div className="text-xs text-gray-500 italic px-2">+{lowBatteryList.length - 5} autres...</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

