'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import StatsCard from '@/components/StatsCard'
import Chart from '@/components/Chart'

export default function ReportsPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const load = async () => {
      try {
        setError(null)
        const data = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/reports/overview',
          {},
          { requiresAuth: true }
        )
        setReport(data)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [API_URL, fetchWithAuth])

  const overview = report?.overview || {}
  const severity = report?.severity_breakdown || []
  const assignments = report?.assignments || []

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold">📊 Rapports & Statistiques</h1>
          <p className="text-gray-600 mt-1">Synthèse des flux terrain et alertes issus du firmware.</p>
        </div>
        <button className="btn-secondary" onClick={() => window.location.reload()}>🔁 Actualiser</button>
      </div>

      {error && (
        <div className="alert alert-warning">
          <strong>Erreur API :</strong> {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1,2,3,4,5,6].map(i => <div key={i} className="card animate-shimmer h-32" />)}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <StatsCard title="Dispositifs actifs" value={overview.devices_active} icon="⚙️" />
            <StatsCard title="Mesures dernières 24h" value={overview.measurements_24h} icon="📈" color="blue" />
            <StatsCard title="Alertes non résolues" value={overview.alerts_unresolved} icon="🚨" color="red" />
            <StatsCard title="Débit moyen (24h)" value={`${overview.avg_flowrate_24h || 0} L/min`} icon="💧" color="green" />
            <StatsCard title="Batterie moyenne (24h)" value={`${overview.avg_battery_24h || 0}%`} icon="🔋" color="orange" />
            <StatsCard title="Parc total" value={overview.devices_total} icon="📟" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <div className="card">
              <h2 className="text-xl font-semibold mb-2">Tendance 7 derniers jours</h2>
              <Chart data={(report?.trend || []).map(day => ({
                ...day,
                timestamp: day.day,
                flowrate: day.avg_flowrate,
                battery: day.avg_battery
              }))} type="flowrate" />
            </div>
            <div className="card space-y-3">
              <h2 className="text-xl font-semibold">Répartition des alertes</h2>
              {severity.length === 0 ? (
                <p className="text-gray-500">Aucune alerte en attente 🎉</p>
              ) : severity.map(item => (
                <div key={item.severity} className="flex items-center justify-between border rounded-lg p-3">
                  <span className="font-medium capitalize">{item.severity}</span>
                  <span className="text-lg">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold mb-3">Top dispositifs surveillés</h2>
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
                  {(report?.top_devices || []).map(device => (
                    <tr key={device.id} className="border-b">
                      <td className="py-2">
                        <p className="font-medium">{device.device_name || device.sim_iccid}</p>
                        <p className="text-xs text-gray-500">{device.status}</p>
                      </td>
                      <td className="py-2">{device.avg_flowrate ?? '—'} L/min</td>
                      <td className="py-2">{device.avg_battery ?? '—'}%</td>
                      <td className="py-2 text-sm text-gray-600">
                        {device.last_measurement ? new Date(device.last_measurement).toLocaleString('fr-FR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2 className="text-xl font-semibold mb-3">Patients & dispositifs associés</h2>
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
                  {assignments.map((row) => (
                    <tr key={row.patient_id} className="border-b">
                      <td className="py-2">{row.first_name} {row.last_name}</td>
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
        </>
      )}
    </div>
  )
}

