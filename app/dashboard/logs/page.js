'use client'

// Désactiver le pré-rendu statique
export const dynamic = 'force-dynamic'

import { useApiData, useFilter } from '@/hooks'
import { formatDateTime } from '@/lib/utils'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import FilterButtons from '@/components/FilterButtons'
import FilterSelect from '@/components/FilterSelect'
import SearchBar from '@/components/SearchBar'

const typeStyles = {
  INFO: 'bg-blue-50 text-blue-700 border-blue-200',
  WARN: 'bg-orange-50 text-orange-700 border-orange-200',
  ERROR: 'bg-red-50 text-red-700 border-red-200'
}

export default function LogsPage() {
  // Charger les données avec useApiData
  const { data: logsData, loading, error, refetch } = useApiData(
    ['/api.php/logs?limit=200', '/api.php/devices'],
    { requiresAuth: false }
  )

  const logs = logsData?.logs?.logs || []
  const devices = logsData?.devices?.devices || []

  // Utiliser useFilter pour la recherche et filtres
  const {
    searchTerm,
    setSearchTerm,
    filters,
    setFilter,
    filteredItems: filteredLogs
  } = useFilter(logs, {
    searchFn: (items, term) => {
      return items.filter(log => 
        log.message?.toLowerCase().includes(term.toLowerCase())
      )
    },
    filterFn: (items, filters) => {
      return items.filter(log => {
    const level = (log.level || 'INFO').toUpperCase()
        if (filters.type && filters.type !== 'ALL' && level !== filters.type) return false
        if (filters.device && filters.device !== 'ALL' && String(log.device_id) !== filters.device) return false
        return true
      })
    }
  })

  const typeFilter = filters.type || 'ALL'
  const deviceFilter = filters.device || 'ALL'

  const typeOptions = [
    { value: 'ALL', label: 'Tous' },
    { value: 'INFO', label: 'INFO' },
    { value: 'WARN', label: 'WARN' },
    { value: 'ERROR', label: 'ERROR' }
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">📝 Journal Système</h1>
        <p className="text-gray-600 mt-1">Suivi temps réel des événements terrain.</p>
      </div>

      {/* Filtres */}
      <div className="flex flex-col md:flex-row gap-3">
        <FilterButtons
          options={typeOptions}
          selected={typeFilter}
          onChange={(value) => setFilter('type', value)}
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
            placeholder="Rechercher dans les logs..."
          />
        </div>
      </div>

      {/* Liste des logs */}
      <div className="card space-y-4">
        <ErrorMessage error={error} onRetry={refetch} />

        {loading ? (
          <LoadingSpinner size="lg" text="Chargement des logs..." />
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-2">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">Aucun log ne correspond aux filtres.</div>
            ) : (
              filteredLogs.map((log, i) => {
                const level = (log.level || 'INFO').toUpperCase()
                return (
                  <div
                    key={log.id || i}
                    className={`border rounded-xl p-4 flex items-start gap-4 animate-slide-up ${typeStyles[level] || typeStyles.INFO}`}
                  >
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-lg font-bold">
                      {log.device_name ? log.device_name.split('-').pop() : 'OTT'}
                    </div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-2">
                        <p className="font-semibold text-gray-900">{log.device_name || 'Dispositif inconnu'}</p>
                        <span className="text-xs px-2 py-1 bg-white rounded-full font-semibold">{level}</span>
                        <span className="text-sm text-gray-500">{formatDateTime(log.timestamp || log.created_at)}</span>
                      </div>
                      <p className="text-gray-800">{log.message}</p>
                      <p className="text-xs text-gray-600 mt-1">
                        {log.first_name || log.last_name
                          ? `Patient : ${log.first_name || ''} ${log.last_name || ''}`
                          : 'Patient non assigné'}
                      </p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}
