'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import StatsCard from '@/components/StatsCard'
import AlertCard from '@/components/AlertCard'
import { useApiData } from '@/hooks'
import { useUsb } from '@/contexts/UsbContext'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'

export default function DashboardPage() {
  const router = useRouter()
  const { isConnected, usbConnectedDevice, usbDeviceInfo } = useUsb()
  
  // Charger les données avec useApiData
  const { data, loading, error, refetch } = useApiData(
    ['/api.php/devices', '/api.php/alerts'],
    { requiresAuth: false }
  )

  // Rafraîchissement automatique toutes les 30 secondes
  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 30000) // 30 secondes
    
    return () => clearInterval(interval)
  }, [refetch])

  const devices = data?.devices?.devices || []
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
    
    return {
      totalDevices: devices.length,
      activeDevices,
      criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
      lowBatteryDevices: devices.filter(d => {
        const battery = d.last_battery
        return battery !== null && battery !== undefined && battery < 30
      }).length
    }
  }, [devices, alerts, isConnected, usbDeviceInfo])

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

      {/* Stats Cards - Indicateurs clés (KPIs uniquement) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Dispositifs Totaux"
          value={stats.totalDevices}
          icon="🔌"
          color="primary"
          delay={0}
        />
        <StatsCard
          title="En Ligne"
          value={stats.activeDevices}
          icon="✅"
          color="green"
          delay={0.1}
        />
        <StatsCard
          title="Alertes Critiques"
          value={stats.criticalAlerts}
          icon="⚠️"
          color="red"
          delay={0.2}
        />
        <StatsCard
          title={stats.lowBatteryDevices > 0 ? "Batterie Faible" : "Batterie OK"}
          value={stats.lowBatteryDevices}
          icon="🔋"
          color={stats.lowBatteryDevices > 0 ? "orange" : "green"}
          delay={0.3}
        />
      </div>

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

