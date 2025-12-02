'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamicImport from 'next/dynamic'
import StatsCard from '@/components/StatsCard'
import AlertCard from '@/components/AlertCard'
import { useApiData, useAutoRefresh } from '@/hooks'
import { useUsb } from '@/contexts/UsbContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import { formatDate } from '@/lib/dateUtils'

// Lazy load de la carte pour accélérer le chargement
const LeafletMap = dynamicImport(() => import('@/components/LeafletMap'), { ssr: false })

export default function DashboardPage() {
  const router = useRouter()
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

      {/* Accès rapide à la Base de Données */}
      {user?.role_name === 'admin' && (
        <div className="card bg-gradient-to-r from-primary-50 to-secondary-50 dark:from-primary-900/20 dark:to-secondary-900/20 border-2 border-primary-200 dark:border-primary-700">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <span>🗄️</span>
                Base de Données Complète
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Accédez à la vue détaillée de toutes les tables ({devices.length} dispositifs, {users.length} utilisateurs, {patients.length} patients, {firmwares.length} firmwares)
              </p>
            </div>
            <button 
              onClick={() => router.push('/dashboard/admin/database-view')}
              className="btn-primary whitespace-nowrap"
            >
              Ouvrir →
            </button>
          </div>
        </div>
      )}

      {/* Section Actions Requises - Consolidée avec toutes les alertes */}
      {(alerts.length > 0 || unassignedDevices.length > 0 || lowBatteryList.length > 0) && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="text-red-500">⚡</span>
            Actions Requises
          </h2>
          
          <div className="space-y-6">
            {/* Toutes les alertes */}
            {alerts.length > 0 && (
              <div>
                <h3 className="font-semibold text-primary mb-3 flex items-center justify-between">
                  <span>🔔 Toutes les Alertes ({alerts.length})</span>
                </h3>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {alerts.map((alert, i) => (
                    <AlertCard key={alert.id} alert={alert} delay={i * 0.05} />
                  ))}
                </div>
              </div>
            )}

            {/* Autres actions (batteries faibles, non assignés) */}
            {(lowBatteryList.length > 0 || unassignedDevices.length > 0) && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                {/* Batteries faibles */}
                {lowBatteryList.length > 0 && (
                  <div className="border-l-4 border-orange-500 pl-4">
                    <h3 className="font-semibold text-orange-600 dark:text-orange-400 mb-2">Batteries Faibles ({lowBatteryList.length})</h3>
                    <div className="space-y-2">
                      {lowBatteryListDisplay.map(device => {
                        const battery = typeof device.last_battery === 'number' ? device.last_battery : parseFloat(device.last_battery) || 0
                        return (
                          <div key={device.id} className="text-sm">
                            <p className="font-semibold text-primary">{device.device_name || device.sim_iccid}</p>
                            <p className="text-xs text-muted">{battery.toFixed(0)}% restant</p>
                          </div>
                        )
                      })}
                    </div>
                    <button className="btn-secondary text-xs mt-2" onClick={() => router.push('/dashboard/outils')}>
                      Voir tous →
                    </button>
                  </div>
                )}

                {/* Boîtiers non assignés */}
                {unassignedDevices.length > 0 && (
                  <div className="border-l-4 border-amber-500 pl-4">
                    <h3 className="font-semibold text-amber-600 dark:text-amber-400 mb-2">Non Assignés ({unassignedDevices.length})</h3>
                    <div className="space-y-2">
                      {unassignedDevices.slice(0, 5).map(device => (
                        <div key={device.id} className="text-sm">
                          <p className="font-semibold text-primary">{device.device_name || device.sim_iccid}</p>
                          <p className="text-xs text-muted">
                            {device.last_seen ? new Date(device.last_seen).toLocaleDateString('fr-FR') : 'Jamais connecté'}
                          </p>
                        </div>
                      ))}
                    </div>
                    <button className="btn-primary text-xs mt-2" onClick={() => router.push('/dashboard/outils')}>
                      Assigner →
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}

