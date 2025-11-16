'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import StatsCard from '@/components/StatsCard'
import DeviceCard from '@/components/DeviceCard'
import AlertCard from '@/components/AlertCard'
import Chart from '@/components/Chart'
import { fetchJson } from '@/lib/api'
import { useRouter } from 'next/navigation'

export default function DashboardPage() {
  const router = useRouter()
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [alerts, setAlerts] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [devicesData, alertsData, measurementsData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, '/api.php/devices'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/alerts'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/measurements/latest')
      ])
      setDevices(devicesData.devices || [])
      setAlerts((alertsData.alerts || []).filter(a => a.status === 'unresolved'))
      setMeasurements(measurementsData.measurements || [])
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
      const lastSeen = new Date(d.last_seen)
      const hoursSince = (new Date() - lastSeen) / (1000 * 60 * 60)
      return hoursSince < 2
    }).length,
    criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    avgBattery: devices.length > 0
      ? (devices.reduce((sum, d) => sum + (d.last_battery || 0), 0) / devices.length).toFixed(1)
      : 0
  }

  const assignedDevices = devices.filter(d => d.first_name || d.last_name)
  const unassignedDevices = devices.filter(d => !d.first_name && !d.last_name)
  const recentAssignments = assignedDevices
    .sort((a, b) => new Date(b.updated_at || b.installation_date || 0) - new Date(a.updated_at || a.installation_date || 0))
    .slice(0, 5)

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="card animate-shimmer h-32"></div>
        ))}
      </div>
    )
  }

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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title="Dispositifs Totaux"
          value={stats.totalDevices}
          icon="🔌"
          color="primary"
          delay={0}
        />
        <StatsCard
          title="Dispositifs Actifs"
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
          title="Batterie Moyenne"
          value={`${stats.avgBattery}%`}
          icon="🔋"
          color="blue"
          delay={0.3}
        />
      </div>

      {/* Graphiques */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card animate-slide-up" style={{animationDelay: '0.4s'}}>
          <h2 className="text-lg font-semibold mb-4">📈 Débits Dernières 24h</h2>
          <Chart data={measurements} type="flowrate" />
        </div>
        
        <div className="card animate-slide-up" style={{animationDelay: '0.5s'}}>
          <h2 className="text-lg font-semibold mb-4">🔋 Niveaux Batterie</h2>
          <Chart data={devices} type="battery" />
        </div>
      </div>

      {/* Rattachements */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card animate-slide-up" style={{animationDelay: '0.55s'}}>
          <h2 className="text-lg font-semibold mb-4">👥 Rattachements récents</h2>
          {recentAssignments.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucun rattachement trouvé.</p>
          ) : (
            <ul className="space-y-3">
              {recentAssignments.map(device => (
                <li key={device.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold">{device.first_name} {device.last_name}</p>
                    <p className="text-gray-500">{device.device_name || device.sim_iccid}</p>
                  </div>
                  <button className="btn-secondary text-xs" onClick={() => router.push(`/dashboard/devices?focus=${device.id}`)}>
                    Voir dispositif
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card animate-slide-up" style={{animationDelay: '0.6s'}}>
          <h2 className="text-lg font-semibold mb-4">📦 Boîtiers non assignés</h2>
          {unassignedDevices.length === 0 ? (
            <p className="text-green-600 text-sm">Tous les boîtiers sont affectés ✅</p>
          ) : (
            <ul className="space-y-3">
              {unassignedDevices.slice(0, 5).map(device => (
                <li key={device.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-semibold">{device.device_name || device.sim_iccid}</p>
                    <p className="text-gray-500">Dernier contact : {device.last_seen ? new Date(device.last_seen).toLocaleString('fr-FR') : 'Jamais'}</p>
                  </div>
                  <button className="btn-primary text-xs" onClick={() => router.push('/dashboard/devices')}>
                    Assigner
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Alertes Récentes */}
      {alerts.length > 0 && (
        <div className="card animate-slide-up" style={{animationDelay: '0.6s'}}>
          <h2 className="text-lg font-semibold mb-4">🔔 Alertes Récentes</h2>
          <div className="space-y-3">
            {alerts.slice(0, 5).map((alert, i) => (
              <AlertCard key={alert.id} alert={alert} delay={i * 0.05} />
            ))}
          </div>
        </div>
      )}

      {/* Dispositifs */}
      <div className="card animate-slide-up" style={{animationDelay: '0.7s'}}>
        <h2 className="text-lg font-semibold mb-4">🔌 Dispositifs</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.slice(0, 6).map((device, i) => (
            <DeviceCard
              key={device.id}
              device={device}
              delay={i * 0.05}
              onSelect={selected => router.push(`/dashboard/map?deviceId=${selected.id}`)}
            />
          ))}
        </div>
        <div className="text-right mt-4">
          <button className="btn-secondary" onClick={() => router.push('/dashboard/map')}>
            Voir tous les dispositifs sur la carte →
          </button>
        </div>
      </div>
    </div>
  )
}

