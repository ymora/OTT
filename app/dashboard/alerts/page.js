'use client'

import { useEffect, useState } from 'react'
import AlertCard from '@/components/AlertCard'
import { demoAlerts } from '@/lib/demoData'

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    loadAlerts()
  }, [])

  const loadAlerts = async () => {
    // ⚠️ MODE DÉMO - Appels API désactivés
    try {
      await new Promise(resolve => setTimeout(resolve, 300))
      setAlerts(demoAlerts)
    } catch (error) {
      console.error('Erreur:', error)
    } finally {
      setLoading(false)
    }
  }

  const filteredAlerts = filter === 'all' 
    ? alerts 
    : alerts.filter(a => a.status === filter)

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">🔔 Alertes</h1>

      {/* Filtres */}
      <div className="flex gap-3">
        {['all', 'unresolved', 'resolved'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              filter === f ? 'bg-primary-500 text-white shadow-lg scale-105' : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            {f === 'all' ? 'Toutes' : f === 'unresolved' ? 'Non résolues' : 'Résolues'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="card animate-shimmer h-24"></div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAlerts.map((alert, i) => (
            <AlertCard key={alert.id} alert={alert} delay={i * 0.03} />
          ))}
        </div>
      )}
    </div>
  )
}

