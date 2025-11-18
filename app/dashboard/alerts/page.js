'use client'

import { useMemo } from 'react'
import AlertCard from '@/components/AlertCard'
import { useApiData, useFilter } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import FilterButtons from '@/components/FilterButtons'
import FilterSelect from '@/components/FilterSelect'
import SearchBar from '@/components/SearchBar'

export default function AlertsPage() {
  // Charger les données avec useApiData
  const { data: alertsData, loading, error, refetch } = useApiData(
    ['/api.php/alerts', '/api.php/devices'],
    { requiresAuth: false }
  )

  const alerts = alertsData?.alerts?.alerts || []
  const devices = alertsData?.devices?.devices || []

  // Filtrer les alertes (uniquement actives)
  const activeAlerts = useMemo(() => {
    return alerts.filter(a => a.status !== 'resolved')
  }, [alerts])

  // Utiliser useFilter pour la recherche et filtres
  const {
    searchTerm,
    setSearchTerm,
    filters,
    setFilter,
    filteredItems
  } = useFilter(activeAlerts, {
    searchFn: (items, term) => {
      const needle = term.toLowerCase()
      return items.filter(a => {
        const haystack = `${a.device_name || ''} ${a.sim_iccid || ''} ${a.first_name || ''} ${a.last_name || ''}`.toLowerCase()
        return haystack.includes(needle)
      })
    },
    filterFn: (items, filters) => {
      return items.filter(a => {
        if (filters.severity && filters.severity !== 'ALL' && a.severity !== filters.severity) return false
        if (filters.device && filters.device !== 'ALL' && String(a.device_id) !== filters.device) return false
      return true
    })
    }
  })

  const severityFilter = filters.severity || 'ALL'
  const deviceFilter = filters.device || 'ALL'

  const severityOptions = [
    { value: 'ALL', label: 'Toutes' },
    { value: 'critical', label: 'Critique' },
    { value: 'high', label: 'Haute' },
    { value: 'medium', label: 'Moyenne' },
    { value: 'low', label: 'Basse' }
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <h1 className="text-3xl font-bold">🔔 Alertes</h1>

      {/* Filtres */}
      <div className="flex flex-col md:flex-row gap-3">
        <FilterButtons
          options={severityOptions}
          selected={severityFilter}
          onChange={(value) => setFilter('severity', value)}
        />

        <div className="flex gap-3 md:ml-auto">
          <FilterSelect
            value={deviceFilter}
            onChange={(value) => setFilter('device', value)}
            options={[{ id: 'ALL', name: 'Tous les dispositifs' }, ...devices]}
            placeholder="Tous les dispositifs"
            getLabel={(opt) => opt.name || opt.device_name || opt.sim_iccid}
          />
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Rechercher dans les alertes..."
          />
        </div>
      </div>

      <ErrorMessage error={error} onRetry={refetch} />

      {loading ? (
        <LoadingSpinner size="lg" text="Chargement des alertes..." />
      ) : (
        <div className="space-y-3">
          {filteredItems.length === 0 ? (
            <div className="card text-center py-12 text-gray-500">
              <p className="text-lg mb-2">Aucune alerte active</p>
              <p className="text-sm">Les alertes résolues ne sont pas affichées ici</p>
            </div>
          ) : (
            filteredItems.map((alert, i) => (
            <AlertCard key={alert.id} alert={alert} delay={i * 0.03} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

