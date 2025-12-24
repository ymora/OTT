'use client'


export default function DayDetailsModal({ day, isOpen, onClose }) {
  if (!isOpen || !day) return null

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  const details = day.details || {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-purple-500 p-6 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">
                📅 {formatDate(day.date)}
              </h2>
              <div className="text-sm opacity-90">
                {day.hours}h de travail • {day.commits} commits
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
              aria-label="Fermer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Statistiques rapides */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Développement</div>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{day.dev || 0}</div>
            </div>
            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Correction</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">{day.fix || 0}</div>
            </div>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Test</div>
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{day.test || 0}</div>
            </div>
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Documentation</div>
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{day.doc || 0}</div>
            </div>
          </div>

          {/* Avancées principales */}
          {details.advances && details.advances.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>✨</span>
                Avancées principales ({details.advances.length})
              </h3>
              <ul className="space-y-2">
                {details.advances.map((advance, idx) => (
                  <li key={idx} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border-l-4 border-blue-500">
                    <div className="text-sm text-gray-700 dark:text-gray-300">{advance}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Problèmes résolus */}
          {details.fixes && details.fixes.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>🔧</span>
                Problèmes résolus ({details.fixes.length})
              </h3>
              <ul className="space-y-2">
                {details.fixes.map((fix, idx) => (
                  <li key={idx} className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border-l-4 border-red-500">
                    <div className="text-sm text-gray-700 dark:text-gray-300">{fix}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Redéploiements */}
          {details.deployments && details.deployments.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>🚀</span>
                Redéploiements ({details.deployments.length})
              </h3>
              <ul className="space-y-2">
                {details.deployments.map((deploy, idx) => (
                  <li key={idx} className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border-l-4 border-purple-500">
                    <div className="text-sm text-gray-700 dark:text-gray-300">{deploy}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tests */}
          {details.tests && details.tests.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span>🧪</span>
                Tests ({details.tests.length})
              </h3>
              <ul className="space-y-2">
                {details.tests.map((test, idx) => (
                  <li key={idx} className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-3 border-l-4 border-yellow-500">
                    <div className="text-sm text-gray-700 dark:text-gray-300">{test}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Message si aucun détail */}
          {(!details.advances || details.advances.length === 0) &&
           (!details.fixes || details.fixes.length === 0) &&
           (!details.deployments || details.deployments.length === 0) &&
           (!details.tests || details.tests.length === 0) && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <p>Aucun détail disponible pour ce jour</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}

