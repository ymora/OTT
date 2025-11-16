'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import StatsCard from '@/components/StatsCard'
import AlertCard from '@/components/AlertCard'
import { fetchJson } from '@/lib/api'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [devicesData, alertsData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, '/api.php/devices'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/alerts')
      ])
      setDevices(devicesData.devices || [])
      setAlerts((alertsData.alerts || []).filter(a => a.status === 'unresolved'))
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [API_URL, fetchWithAuth])

  useEffect(() => {
    loadData()
  }, [loadData])

  const stats = {
    totalDevices: devices.length,
    activeDevices: devices.filter(d => {
      // Gérer les valeurs null, undefined ou invalides
      if (!d.last_seen) return false
      const lastSeen = new Date(d.last_seen)
      // Vérifier que la date est valide
      if (isNaN(lastSeen.getTime())) return false
      const hoursSince = (new Date() - lastSeen) / (1000 * 60 * 60)
      return hoursSince < 2
    }).length,
    criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    lowBatteryDevices: devices.filter(d => {
      const battery = d.last_battery
      return battery !== null && battery !== undefined && battery < 30
    }).length
  }

  const unassignedDevices = devices.filter(d => !d.first_name && !d.last_name)

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card animate-shimmer h-32"></div>
        ))}
      </div>
    )
  }

  const criticalItems = alerts.filter(a => a.severity === 'critical' || a.severity === 'high')
  const lowBatteryList = devices.filter(d => {
    const battery = d.last_battery
    return battery !== null && battery !== undefined && battery < 30
  }).slice(0, 5)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="animate-slide-up">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Vue d&apos;Ensemble</h1>
        <p className="text-gray-600">Tableau de bord en temps réel des dispositifs OTT</p>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

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

      {/* Section Actions Requises */}
      {(criticalItems.length > 0 || unassignedDevices.length > 0 || lowBatteryList.length > 0) && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <span className="text-red-500">⚡</span>
            Actions Requises
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Alertes critiques */}
            {criticalItems.length > 0 && (
              <div className="border-l-4 border-red-500 pl-4">
                <h3 className="font-semibold text-red-700 mb-2">Alertes Critiques ({criticalItems.length})</h3>
                <div className="space-y-2">
                  {criticalItems.slice(0, 3).map(alert => (
                    <div key={alert.id} className="text-sm">
                      <p className="font-medium">{alert.message}</p>
                      <p className="text-xs text-gray-500">{alert.device_name || alert.sim_iccid}</p>
                    </div>
                  ))}
                </div>
                <button className="btn-secondary text-xs mt-2" onClick={() => router.push('/dashboard/alerts')}>
                  Voir toutes →
                </button>
              </div>
            )}

            {/* Batteries faibles */}
            {lowBatteryList.length > 0 && (
              <div className="border-l-4 border-orange-500 pl-4">
                <h3 className="font-semibold text-orange-700 mb-2">Batteries Faibles ({lowBatteryList.length})</h3>
                <div className="space-y-2">
                  {lowBatteryList.map(device => {
                    const battery = typeof device.last_battery === 'number' ? device.last_battery : parseFloat(device.last_battery) || 0
                    return (
                      <div key={device.id} className="text-sm">
                        <p className="font-medium">{device.device_name || device.sim_iccid}</p>
                        <p className="text-xs text-gray-500">{battery.toFixed(0)}% restant</p>
                      </div>
                    )
                  })}
                </div>
                <button className="btn-secondary text-xs mt-2" onClick={() => router.push('/dashboard/devices')}>
                  Voir tous →
                </button>
              </div>
            )}

            {/* Boîtiers non assignés */}
            {unassignedDevices.length > 0 && (
              <div className="border-l-4 border-amber-500 pl-4">
                <h3 className="font-semibold text-amber-700 mb-2">Non Assignés ({unassignedDevices.length})</h3>
                <div className="space-y-2">
                  {unassignedDevices.slice(0, 3).map(device => (
                    <div key={device.id} className="text-sm">
                      <p className="font-medium">{device.device_name || device.sim_iccid}</p>
                      <p className="text-xs text-gray-500">
                        {device.last_seen ? new Date(device.last_seen).toLocaleDateString('fr-FR') : 'Jamais connecté'}
                      </p>
                    </div>
                  ))}
                </div>
                <button className="btn-primary text-xs mt-2" onClick={() => router.push('/dashboard/devices')}>
                  Assigner →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section Activité Récente - Aperçu uniquement */}
      {alerts.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">🔔 Activité Récente</h2>
            <button className="btn-secondary text-xs" onClick={() => router.push('/dashboard/alerts')}>
              Voir toutes les alertes →
            </button>
          </div>
          <div className="space-y-2">
            {alerts.slice(0, 3).map((alert, i) => (
              <AlertCard key={alert.id} alert={alert} delay={i * 0.05} />
            ))}
          </div>
        </div>
      )}

      {/* Actions rapides */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-4">🚀 Accès Rapide</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <button className="btn-primary text-sm" onClick={() => router.push('/dashboard/map')}>
            📍 Carte
          </button>
          <button className="btn-primary text-sm" onClick={() => router.push('/dashboard/devices')}>
            🔌 Dispositifs
          </button>
          <button className="btn-primary text-sm" onClick={() => router.push('/dashboard/patients')}>
            👥 Patients
          </button>
          <button className="btn-primary text-sm" onClick={() => router.push('/dashboard/alerts')}>
            🔔 Alertes
          </button>
        </div>
      </div>
    </div>
  )
}

