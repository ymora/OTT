'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import StatsCard from '@/components/StatsCard'
import DeviceCard from '@/components/DeviceCard'
import AlertCard from '@/components/AlertCard'
import Chart from '@/components/Chart'

export default function DashboardPage() {
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [alerts, setAlerts] = useState([])
  const [measurements, setMeasurements] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    // ⚠️ MODE DÉMO - Appels API désactivés temporairement
    try {
      // Simulation chargement
      await new Promise(resolve => setTimeout(resolve, 500))
      
      // Données vides pour afficher l'interface
      setDevices([])
      setAlerts([])
      setMeasurements([])
    } catch (error) {
      console.error('Erreur chargement:', error)
    } finally {
      setLoading(false)
    }
  }

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
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Vue d'Ensemble</h1>
        <p className="text-gray-600">Tableau de bord en temps réel des dispositifs OTT</p>
      </div>

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
            <DeviceCard key={device.id} device={device} delay={i * 0.05} />
          ))}
        </div>
      </div>
    </div>
  )
}

