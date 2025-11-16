'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import StatsCard from '@/components/StatsCard'
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

  const [report, setReport] = useState(null)

  const loadData = useCallback(async () => {
    try {
      setError(null)
      const [devicesData, alertsData, measurementsData, reportData] = await Promise.all([
        fetchJson(fetchWithAuth, API_URL, '/api.php/devices'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/alerts'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/measurements/latest'),
        fetchJson(fetchWithAuth, API_URL, '/api.php/reports/overview', {}, { requiresAuth: true }).catch(() => null)
      ])
      setDevices(devicesData.devices || [])
      setAlerts((alertsData.alerts || []).filter(a => a.status === 'unresolved'))
      setMeasurements(measurementsData.measurements || [])
      setReport(reportData)
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

  const assignedDevices = devices.filter(d => d.first_name || d.last_name)
  const unassignedDevices = devices.filter(d => !d.first_name && !d.last_name)
  const recentAssignments = assignedDevices
    .sort((a, b) => {
      // Fonction helper pour obtenir un timestamp valide ou null
      const getTimestamp = (device) => {
        const dateStr = device.updated_at || device.installation_date
        if (!dateStr) return null
        const date = new Date(dateStr)
        return isNaN(date.getTime()) ? null : date.getTime()
      }
      
      const timestampA = getTimestamp(a)
      const timestampB = getTimestamp(b)
      
      // Les dispositifs sans date vont à la fin (timestamp null = très petit)
      if (timestampA === null && timestampB === null) return 0
      if (timestampA === null) return 1  // A va après B
      if (timestampB === null) return -1 // B va après A
      
      // Tri décroissant : les plus récents en premier
      return timestampB - timestampA
    })
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

      {/* Stats Cards - Indicateurs clés */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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
        {report?.overview && (
          <>
            <StatsCard
              title="Mesures 24h"
              value={Number(report.overview.measurements_24h) || 0}
              icon="📈"
              color="blue"
              delay={0.4}
            />
            <StatsCard
              title="Débit Moyen"
              value={`${Number(report.overview.avg_flowrate_24h) || 0} L/min`}
              icon="💧"
              color="green"
              delay={0.5}
            />
          </>
        )}
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

      {/* Section Surveillance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Alertes récentes */}
        {alerts.length > 0 && (
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">🔔 Alertes Récentes</h2>
              <button className="btn-secondary text-xs" onClick={() => router.push('/dashboard/alerts')}>
                Tout voir →
              </button>
            </div>
            <div className="space-y-2">
              {alerts.slice(0, 4).map((alert, i) => (
                <AlertCard key={alert.id} alert={alert} delay={i * 0.05} />
              ))}
            </div>
          </div>
        )}

        {/* Rattachements récents */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">👥 Rattachements Récents</h2>
            <button className="btn-secondary text-xs" onClick={() => router.push('/dashboard/patients')}>
              Gérer →
            </button>
          </div>
          {recentAssignments.length === 0 ? (
            <p className="text-gray-500 text-sm">Aucun rattachement récent</p>
          ) : (
            <ul className="space-y-2">
              {recentAssignments.slice(0, 4).map(device => (
                <li key={device.id} className="flex items-center justify-between text-sm p-2 hover:bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">{device.first_name} {device.last_name}</p>
                    <p className="text-xs text-gray-500">{device.device_name || device.sim_iccid}</p>
                  </div>
                  <button 
                    className="btn-secondary text-xs" 
                    onClick={() => router.push(`/dashboard/map?deviceId=${device.id}`)}
                  >
                    Voir
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Section Données - Graphiques */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">📊 Données Récentes (24h)</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">Débits</h3>
              <div className="h-48">
                <Chart data={measurements} type="flowrate" />
              </div>
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-2">Batteries</h3>
              <div className="h-48">
                <Chart data={devices} type="battery" />
              </div>
            </div>
          </div>
        </div>

        {/* Tendance 7 jours */}
        {report?.trend && report.trend.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">📈 Tendance 7 Jours</h2>
            <div className="h-64">
              <Chart 
                data={report.trend.map(day => ({
                  ...day,
                  timestamp: day.day,
                  flowrate: day.avg_flowrate,
                  battery: day.avg_battery
                }))} 
                type="flowrate" 
              />
            </div>
          </div>
        )}

        {/* Répartition des alertes */}
        {report?.severity_breakdown && report.severity_breakdown.length > 0 && (
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">🚨 Répartition des Alertes</h2>
            <div className="space-y-3">
              {report.severity_breakdown.map(item => (
                <div key={item.severity} className="flex items-center justify-between border rounded-lg p-3">
                  <span className="font-medium capitalize">{item.severity}</span>
                  <span className="text-lg font-bold">{item.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Top dispositifs surveillés */}
      {report?.top_devices && report.top_devices.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">⭐ Top Dispositifs Surveillés</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Dispositif</th>
                  <th className="py-2">Débit moyen</th>
                  <th className="py-2">Batterie moyenne</th>
                  <th className="py-2">Dernière mesure</th>
                </tr>
              </thead>
              <tbody>
                {report.top_devices.map(device => {
                  const flowrate = typeof device.avg_flowrate === 'number' ? device.avg_flowrate : parseFloat(device.avg_flowrate)
                  const battery = typeof device.avg_battery === 'number' ? device.avg_battery : parseFloat(device.avg_battery)
                  return (
                    <tr key={device.id} className="border-b hover:bg-gray-50">
                      <td className="py-2">
                        <p className="font-medium">{device.device_name || device.sim_iccid}</p>
                        <p className="text-xs text-gray-500">{device.status}</p>
                      </td>
                      <td className="py-2">{!isNaN(flowrate) ? `${flowrate.toFixed(2)} L/min` : '—'}</td>
                      <td className="py-2">{!isNaN(battery) ? `${battery.toFixed(1)}%` : '—'}</td>
                      <td className="py-2 text-sm text-gray-600">
                        {device.last_measurement ? new Date(device.last_measurement).toLocaleString('fr-FR') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Patients & dispositifs associés */}
      {report?.assignments && report.assignments.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">👥 Patients & Dispositifs Associés</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-2">Patient</th>
                  <th className="py-2">Dispositif</th>
                  <th className="py-2">Statut</th>
                  <th className="py-2">Dernier contact</th>
                </tr>
              </thead>
              <tbody>
                {report.assignments.map((row) => (
                  <tr key={row.patient_id} className="border-b hover:bg-gray-50">
                    <td className="py-2 font-medium">{row.first_name} {row.last_name}</td>
                    <td className="py-2">
                      {row.device_name ? (
                        <>
                          <p className="font-medium">{row.device_name}</p>
                          <p className="text-xs text-gray-500">{row.sim_iccid}</p>
                        </>
                      ) : (
                        <span className="text-amber-600 text-sm">Aucun boîtier</span>
                      )}
                    </td>
                    <td className="py-2">{row.status || '—'}</td>
                    <td className="py-2 text-sm text-gray-600">
                      {row.last_seen ? new Date(row.last_seen).toLocaleString('fr-FR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

