'use client'

import { useState, useCallback, useEffect } from 'react'

/**
 * Composant d'autotest pour valider le fonctionnement d'un dispositif après flash
 */
export default function DeviceAutotest({ 
  isConnected, 
  logs = [], 
  onRunTest 
}) {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState(null)
  const [progress, setProgress] = useState(0)

  // Tests à effectuer
  const tests = [
    {
      id: 'firmware_boot',
      name: 'Firmware démarré',
      description: 'Vérifier que le firmware a démarré correctement',
      check: (logs) => {
        return logs.some(log => 
          log.raw.includes('[BOOT]') || 
          log.raw.includes('Firmware version') ||
          log.raw.includes('Version:')
        )
      }
    },
    {
      id: 'modem_init',
      name: 'Modem initialisé',
      description: 'Vérifier que le modem s\'est initialisé',
      check: (logs) => {
        return logs.some(log => 
          log.raw.includes('[MODEM]') && 
          (log.raw.includes('initialisé') || log.raw.includes('ready') || log.raw.includes('OK'))
        )
      }
    },
    {
      id: 'sim_detected',
      name: 'SIM détectée',
      description: 'Vérifier que la SIM est détectée et l\'ICCID lu',
      check: (logs) => {
        return logs.some(log => 
          log.raw.includes('ICCID') || 
          log.raw.includes('SIM READY') ||
          log.raw.includes('SIM prête')
        )
      }
    },
    {
      id: 'network_attach',
      name: 'Réseau attaché',
      description: 'Vérifier que le dispositif s\'est attaché au réseau',
      check: (logs) => {
        return logs.some(log => 
          log.raw.includes('réseau') && 
          (log.raw.includes('attaché') || log.raw.includes('attached') || log.raw.includes('connected'))
        )
      }
    },
    {
      id: 'api_accessible',
      name: 'API accessible',
      description: 'Vérifier que le dispositif peut communiquer avec l\'API',
      check: (logs) => {
        return logs.some(log => 
          log.raw.includes('[API]') && 
          (log.raw.includes('succès') || log.raw.includes('success') || log.raw.includes('OK'))
        )
      }
    }
  ]

  // Lancer les tests
  const runTests = useCallback(async () => {
    if (!isConnected) {
      alert('Connectez d\'abord un port série')
      return
    }

    setIsRunning(true)
    setResults(null)
    setProgress(0)

    // Attendre un peu pour que les logs s'accumulent
    await new Promise(resolve => setTimeout(resolve, 2000))

    // Exécuter les tests
    const testResults = tests.map((test, index) => {
      setProgress(((index + 1) / tests.length) * 100)
      const passed = test.check(logs)
      return {
        ...test,
        status: passed ? 'PASS' : 'FAIL',
        details: passed ? 'Test réussi' : 'Non détecté dans les logs'
      }
    })

    // Calculer le résultat global
    const passedCount = testResults.filter(r => r.status === 'PASS').length
    const overall = passedCount === tests.length ? 'PASS' : 
                   passedCount > 0 ? 'PARTIAL' : 'FAIL'

    setResults({
      overall,
      tests: testResults,
      passedCount,
      totalCount: tests.length,
      timestamp: new Date()
    })

    setIsRunning(false)
    setProgress(0)

    // Callback si fourni
    if (onRunTest) {
      onRunTest({ overall, tests: testResults })
    }
  }, [isConnected, logs, tests, onRunTest])

  // Réinitialiser les résultats quand les logs changent
  useEffect(() => {
    if (results && logs.length > results.timestamp) {
      // Les logs ont changé, on peut réinitialiser
      // (optionnel, pour permettre de relancer les tests)
    }
  }, [logs, results])

  if (!isConnected) {
    return (
      <div className="card bg-gray-50 dark:bg-gray-800/50 border-dashed">
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg mb-2">🔌 Connectez un port série</p>
          <p className="text-sm">L&apos;autotest nécessite une connexion série active</p>
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold">✅ Autotest</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Vérifier automatiquement que le dispositif fonctionne correctement
          </p>
        </div>
        <button
          onClick={runTests}
          disabled={isRunning}
          className="btn-primary"
        >
          {isRunning ? '⏳ Test en cours...' : '🚀 Lancer l\'autotest'}
        </button>
      </div>

      {/* Barre de progression */}
      {isRunning && (
        <div className="mb-4">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-primary-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1 text-center">
            Exécution des tests... {Math.round(progress)}%
          </p>
        </div>
      )}

      {/* Résultats */}
      {results && (
        <div className="space-y-4">
          {/* Résultat global */}
          <div className={`p-4 rounded-lg border-2 ${
            results.overall === 'PASS' 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-500 dark:border-green-400'
              : results.overall === 'PARTIAL'
              ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-500 dark:border-yellow-400'
              : 'bg-red-50 dark:bg-red-900/20 border-red-500 dark:border-red-400'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold text-lg">
                  {results.overall === 'PASS' ? '✅ Tous les tests réussis' :
                   results.overall === 'PARTIAL' ? '⚠️ Tests partiels' :
                   '❌ Tests échoués'}
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {results.passedCount} sur {results.totalCount} tests réussis
                </p>
              </div>
              <div className="text-3xl">
                {results.overall === 'PASS' ? '✅' :
                 results.overall === 'PARTIAL' ? '⚠️' : '❌'}
              </div>
            </div>
          </div>

          {/* Détails des tests */}
          <div className="space-y-2">
            {results.tests.map((test) => (
              <div
                key={test.id}
                className={`p-3 rounded-lg border ${
                  test.status === 'PASS'
                    ? 'bg-green-50/50 dark:bg-green-900/10 border-green-200 dark:border-green-800'
                    : 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {test.status === 'PASS' ? '✅' : '❌'}
                      </span>
                      <span className="font-semibold">{test.name}</span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {test.description}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                      {test.details}
                    </p>
                  </div>
                  <span className={`badge ${
                    test.status === 'PASS' ? 'badge-success' : 'badge-error'
                  }`}>
                    {test.status}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={runTests}
              className="btn-secondary text-sm"
            >
              🔄 Relancer les tests
            </button>
            <button
              onClick={() => setResults(null)}
              className="btn-secondary text-sm"
            >
              🗑️ Effacer les résultats
            </button>
          </div>
        </div>
      )}

      {/* Aide */}
      {!results && !isRunning && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-3 rounded">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            💡 <strong>Astuce :</strong> Après avoir flashé le firmware, attendez quelques secondes 
            que le dispositif démarre, puis lancez l&apos;autotest pour vérifier que tout fonctionne.
          </p>
        </div>
      )}
    </div>
  )
}

