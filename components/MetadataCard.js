'use client'

export default function MetadataCard({ metadata }) {
  if (!metadata) return null

  const hasFilters = metadata.filters && (
    metadata.filters.author || 
    metadata.filters.since || 
    metadata.filters.until
  )

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  return (
    <div className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-lg shadow-lg p-6 mb-6 text-white">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span>📊</span>
        Informations de l&apos;Analyse
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metadata.period && (
          <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-xs opacity-90 mb-1">Période analysée</div>
            <div className="font-semibold">
              {formatDate(metadata.period.start)} - {formatDate(metadata.period.end)}
            </div>
          </div>
        )}
        
        {metadata.author && (
          <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-xs opacity-90 mb-1">Développeur</div>
            <div className="font-semibold">{metadata.author}</div>
          </div>
        )}

        {metadata.project && (
          <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-xs opacity-90 mb-1">Projet</div>
            <div className="font-semibold text-sm">{metadata.project}</div>
          </div>
        )}

        {metadata.branchesAnalyzed && (
          <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-xs opacity-90 mb-1">Branches analysées</div>
            <div className="font-semibold">{metadata.branchesAnalyzed}</div>
          </div>
        )}

        {hasFilters && (
          <div className="bg-yellow-500/30 rounded-lg p-3 backdrop-blur-sm border border-yellow-300/50">
            <div className="text-xs opacity-90 mb-1 flex items-center gap-1">
              <span>⚠️</span>
              Filtres actifs
            </div>
            <div className="text-sm space-y-1">
              {metadata.filters.author && (
                <div>Auteur: <span className="font-semibold">{metadata.filters.author}</span></div>
              )}
              {metadata.filters.since && (
                <div>Depuis: <span className="font-semibold">{metadata.filters.since}</span></div>
              )}
              {metadata.filters.until && (
                <div>Jusqu&apos;à: <span className="font-semibold">{metadata.filters.until}</span></div>
              )}
            </div>
          </div>
        )}

        {metadata.lastGenerated && (
          <div className="bg-white/20 rounded-lg p-3 backdrop-blur-sm">
            <div className="text-xs opacity-90 mb-1">Dernière génération</div>
            <div className="font-semibold text-sm">{metadata.lastGenerated}</div>
          </div>
        )}
      </div>
    </div>
  )
}

