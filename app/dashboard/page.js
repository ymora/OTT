'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamicImport from 'next/dynamic'
import StatsCard from '@/components/StatsCard'
import AlertCard from '@/components/AlertCard'
import { useApiData, useAutoRefresh } from '@/hooks'
import { useAuth } from '@/contexts/AuthContext'
import { useUsb } from '@/contexts/UsbContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { formatDate } from '@/lib/dateUtils'

// Lazy load de la carte pour accélérer le chargement
const LeafletMap = dynamicImport(() => import('@/components/LeafletMap'), { ssr: false })

export default function DashboardPage() {
  const router = useRouter()
  const { user } = useAuth()
  const { isConnected, usbConnectedDevice, usbDeviceInfo, usbStreamLastMeasurement } = useUsb()
  
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
  
  const [selectedDeviceOnMap, setSelectedDeviceOnMap] = useState(null)

  // Utiliser le hook useAutoRefresh pour le rafraîchissement automatique
  useAutoRefresh(refetch, 30000)

  const devices = data?.devices?.devices || []
  const users = data?.users?.users || []
  const patients = data?.patients?.patients || []
  const firmwares = data?.firmwares?.firmwares || []
  const alerts = useMemo(() => {
    return (data?.alerts?.alerts || []).filter(a => a.status === 'unresolved')
  }, [data])

  // Mémoriser les calculs coûteux pour éviter les recalculs inutiles
  const stats = useMemo(() => {
    // Compter les dispositifs en ligne depuis la base de données (last_seen < 2h)
    const onlineFromDb = devices.filter(d => {
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
    
    // Calculer les batteries faibles depuis la base de données
    const lowBatteryFromDb = devices.filter(d => {
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
    
    // Calculer le nombre total de dispositifs avec batterie OK (>= 30%)
    const devicesWithBattery = devices.filter(d => {
      const battery = d.last_battery
      return battery !== null && battery !== undefined
    })
    const okBatteryFromDb = devicesWithBattery.filter(d => d.last_battery >= 30).length
    const okBatteryDevices = okBatteryFromDb + (usbBatteryOk && !usbDeviceAlreadyCounted ? 1 : 0)
    
    // Total dispositifs : base de données + USB si pas déjà compté
    const totalDevices = devices.length + (usbDeviceOnline && !usbDeviceAlreadyCounted ? 1 : 0)
    
    return {
      totalDevices,
      activeDevices,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      lowBatteryDevices,
      okBatteryDevices
    }
  }, [devices, alerts, isConnected, usbDeviceInfo, usbStreamLastMeasurement])

  const unassignedDevices = useMemo(() => 
    devices.filter(d => !d.first_name && !d.last_name),
    [devices]
  )
  
  const lowBatteryList = useMemo(() => 
    devices.filter(d => {
      const battery = d.last_battery
      return battery !== null && battery !== undefined && battery < 30
    }),
    [devices]
  )

  // Tous les hooks doivent être appelés avant tout return conditionnel
  const criticalItems = useMemo(() => 
    alerts.filter(a => a.severity === 'critical' || a.severity === 'high'),
    [alerts]
  )
  
  // Limiter à 5 pour l'affichage
  const lowBatteryListDisplay = useMemo(() => 
    lowBatteryList.slice(0, 5),
    [lowBatteryList]
  )

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
      {!loading && devices.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">🗺️ Carte des Dispositifs</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {devices.filter(d => d.latitude && d.longitude).length} dispositif(s) géolocalisé(s)
            </p>
          </div>
          <div style={{ height: '400px', width: '100%', position: 'relative', zIndex: 1 }}>
            <LeafletMap
              devices={devices}
              focusDeviceId={null}
              onSelect={(device) => {
                setSelectedDeviceOnMap(device)
                // Changer l'onglet pour afficher le dispositif sélectionné
                setDatabaseTab('devices')
              }}
            />
          </div>
        </div>
      )}

      {/* Stats Cards - Indicateurs clés (KPIs uniquement) - TAILLE RÉDUITE */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Cards plus compactes */}
        <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm p-3 border border-gray-200 dark:border-gray-700 animate-slide-up">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Dispositifs</p>
              <p className="text-2xl font-bold text-primary-600 dark:text-primary-400">{stats.totalDevices}</p>
            </div>
            <span className="text-3xl">🔌</span>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm p-3 border border-gray-200 dark:border-gray-700 animate-slide-up" style={{animationDelay: '0.1s'}}>
              <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">En Ligne</p>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.activeDevices}</p>
            </div>
            <span className="text-3xl">✅</span>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm p-3 border border-gray-200 dark:border-gray-700 animate-slide-up" style={{animationDelay: '0.2s'}}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">Alertes</p>
              <p className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.criticalAlerts}</p>
            </div>
            <span className="text-3xl">⚠️</span>
          </div>
        </div>
        
        <div className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm p-3 border border-gray-200 dark:border-gray-700 animate-slide-up" style={{animationDelay: '0.3s'}}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {stats.lowBatteryDevices > 0 ? "🔋 Faibles" : "🔋 OK"}
              </p>
              <p className={`text-2xl font-bold ${stats.lowBatteryDevices > 0 ? 'text-orange-600 dark:text-orange-400' : 'text-green-600 dark:text-green-400'}`}>
                {stats.lowBatteryDevices > 0 ? stats.lowBatteryDevices : stats.okBatteryDevices}
              </p>
            </div>
            <span className="text-3xl">🔋</span>
          </div>
        </div>
      </div>

      {/* Actions Requises - Même format que les KPIs */}
      {(alerts.length > 0 || unassignedDevices.length > 0 || lowBatteryList.length > 0) && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Alertes */}
          {alerts.length > 0 && (
            <div 
              className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm p-3 border-2 border-red-300 dark:border-red-700 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push('/dashboard/outils')}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Alertes Actives</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">{alerts.length}</p>
                </div>
                <span className="text-3xl">🔔</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 max-h-16 overflow-y-auto">
                {alerts.slice(0, 2).map(alert => (
                  <div key={alert.id} className="truncate">• {alert.message}</div>
                ))}
                {alerts.length > 2 && <div className="font-semibold">+{alerts.length - 2} autres...</div>}
              </div>
            </div>
          )}

          {/* Batteries faibles */}
          {lowBatteryList.length > 0 && (
            <div 
              className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm p-3 border-2 border-orange-300 dark:border-orange-700 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push('/dashboard/outils')}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Batteries Faibles</p>
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{lowBatteryList.length}</p>
                </div>
                <span className="text-3xl">🔋</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 max-h-16 overflow-y-auto">
                {lowBatteryListDisplay.map(device => {
                  const battery = typeof device.last_battery === 'number' ? device.last_battery : parseFloat(device.last_battery) || 0
                  return (
                    <div key={device.id} className="truncate">
                      • {device.device_name || device.sim_iccid}: {battery.toFixed(0)}%
                    </div>
                  )
                })}
                {lowBatteryList.length > 5 && <div className="font-semibold">+{lowBatteryList.length - 5} autres...</div>}
              </div>
            </div>
          )}

          {/* Boîtiers non assignés */}
          {unassignedDevices.length > 0 && (
            <div 
              className="bg-white dark:bg-[rgb(var(--night-surface))] rounded-lg shadow-sm p-3 border-2 border-amber-300 dark:border-amber-700 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => router.push('/dashboard/outils')}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-xs text-gray-600 dark:text-gray-400">Non Assignés</p>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{unassignedDevices.length}</p>
                </div>
                <span className="text-3xl">📦</span>
              </div>
              <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1 max-h-16 overflow-y-auto">
                {unassignedDevices.slice(0, 2).map(device => (
                  <div key={device.id} className="truncate">
                    • {device.device_name || device.sim_iccid}
                  </div>
                ))}
                {unassignedDevices.length > 2 && <div className="font-semibold">+{unassignedDevices.length - 2} autres...</div>}
              </div>
            </div>
          )}
        </div>
      )}

    </div>
  )
}

