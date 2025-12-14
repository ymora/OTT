'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiCall } from '@/hooks'
import logger from '@/lib/logger'
import { fetchJson } from '@/lib/api'

export default function AdminMigrationsPage() {
  const { user, fetchWithAuth, API_URL } = useAuth()
  const [result, setResult] = useState(null)
  const [migrationHistory, setMigrationHistory] = useState([])
  const [showHidden, setShowHidden] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  // Utiliser useApiCall pour simplifier la gestion des appels API
  const { loading, error, call, setError } = useApiCall({ requiresAuth: true, autoReset: false })

  const isAdmin = user?.role_name === 'admin' || user?.role === 'admin' || user?.roles?.includes('admin')

  // Charger l'historique des migrations
  useEffect(() => {
    if (!isAdmin) return
    
    const loadHistory = async () => {
      try {
        setLoadingHistory(true)
        const data = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/migrations/history',
          { method: 'GET' },
          { requiresAuth: true }
        )
        if (data.success) {
          setMigrationHistory(data.history || [])
        }
      } catch (err) {
        logger.error('Erreur chargement historique migrations:', err)
      } finally {
        setLoadingHistory(false)
      }
    }
    
    loadHistory()
  }, [isAdmin, fetchWithAuth, API_URL])

  const runMigration = async (migrationFile) => {
    if (!isAdmin) {
      setError('Accès refusé : administrateur requis')
      return
    }

    setResult(null)

    try {
      const data = await call('/api.php/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ file: migrationFile })
      })

      if (data.success) {
        setResult({
          success: true,
          message: data.message || 'Migration exécutée avec succès',
          logs: data.logs || []
        })
        logger.log(`✅ Migration ${migrationFile} exécutée avec succès`)
        
        // Recharger l'historique après succès
        const historyData = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/migrations/history',
          { method: 'GET' },
          { requiresAuth: true }
        )
        if (historyData.success) {
          setMigrationHistory(historyData.history || [])
        }
      } else {
        // Construire un message d'erreur détaillé
        const errorParts = []
        errorParts.push(`❌ ${data.error || 'Erreur lors de l\'exécution de la migration'}`)
        
        if (data.logs && Array.isArray(data.logs) && data.logs.length > 0) {
          errorParts.push('')
          errorParts.push('📋 Détails:')
          data.logs.forEach(log => {
            errorParts.push(`  ${log}`)
          })
        }
        
        if (data.details) {
          errorParts.push('')
          errorParts.push('🔍 Informations techniques:')
          if (Array.isArray(data.details)) {
            data.details.forEach(detail => {
              errorParts.push(`  ${detail}`)
            })
          } else if (typeof data.details === 'object') {
            errorParts.push(`  ${JSON.stringify(data.details, null, 2)}`)
          } else {
            errorParts.push(`  ${data.details}`)
          }
        }
        
        if (data.code) {
          errorParts.push('')
          errorParts.push(`Code erreur: ${data.code}`)
        }
        
        setError(errorParts.join('\n'))
      }
    } catch (err) {
      logger.error('Erreur migration:', err)
      
      // Construire un message d'erreur détaillé
      let errorMessage = err.message || 'Erreur lors de l\'exécution de la migration'
      const errorParts = []
      
      // Ajouter le message principal
      errorParts.push(`❌ ${errorMessage}`)
      
      // Ajouter les logs si disponibles (priorité)
      if (err.logs && Array.isArray(err.logs) && err.logs.length > 0) {
        errorParts.push('')
        errorParts.push('📋 Détails:')
        err.logs.forEach(log => {
          errorParts.push(`  ${log}`)
        })
      }
      
      // Ajouter les détails si disponibles
      if (err.details) {
        errorParts.push('')
        errorParts.push('🔍 Informations techniques:')
        if (Array.isArray(err.details)) {
          err.details.forEach(detail => {
            errorParts.push(`  ${detail}`)
          })
        } else if (typeof err.details === 'object') {
          errorParts.push(`  ${JSON.stringify(err.details, null, 2)}`)
        } else {
          errorParts.push(`  ${err.details}`)
        }
      }
      
      // Ajouter le code d'erreur
      if (err.code) {
        errorParts.push('')
        errorParts.push(`Code erreur: ${err.code}`)
      }
      
      const fullErrorMessage = errorParts.join('\n')
      setError(fullErrorMessage)
      
      // Afficher aussi dans la console pour debug avec tous les détails
      console.error('Erreur migration complète:', {
        message: err.message,
        error: err.error,
        details: err.details,
        code: err.code,
        logs: err.logs,
        stack: err.stack,
        fullError: err
      })
    }
  }

  if (!isAdmin) {
    return (
      <div className="card">
        <div className="alert alert-warning">
          <p>❌ Accès refusé : Cette page est réservée aux administrateurs.</p>
        </div>
      </div>
    )
  }

  // Liste des migrations disponibles
  const migrationsList = [
    {
      id: 'migration_fix_users_with_roles_view.sql',
      name: '🔥 URGENT: Corriger VIEW users (ERREURS 500)',
      description: '❌ CRITIQUE: Corrige la VIEW users_with_roles qui manque de colonnes (deleted_at, timezone, phone). Ceci résout les erreurs 500 sur TOUTES les pages.',
      variant: 'danger'
    },
    {
      id: 'migration_repair_database.sql',
      name: '🔧 Réparer la base de données',
      description: '✅ Crée toutes les tables manquantes (notifications, index, etc.) SANS PERTE DE DONNÉES. Utilisez ceci pour corriger les erreurs "table not found".',
      variant: 'success'
    },
    {
      id: 'migration_sim_pin_varchar16.sql',
      name: '📱 Mettre à jour sim_pin (VARCHAR 8→16)',
      description: '✅ Augmente la limite de sim_pin de VARCHAR(8) à VARCHAR(16). Corrige l\'erreur "value too long for type character varying(8)" lors de la configuration des dispositifs. Validation applicative reste à 4-8 chiffres (standard 3GPP).',
      variant: 'success'
    },
    {
      id: 'migration_create_migration_history.sql',
      name: '📊 Créer table migration_history',
      description: '✅ Crée la table pour tracker les migrations exécutées. Permet d\'afficher le statut et de masquer les migrations déjà exécutées.',
      variant: 'success'
    }
  ]

  // Enrichir les migrations avec l'historique
  const migrations = useMemo(() => {
    return migrationsList.map(migration => {
      const history = migrationHistory.find(h => h.migration_file === migration.id)
      return {
        ...migration,
        executed: !!history && history.status === 'success',
        executedAt: history?.executed_at,
        executedBy: history?.executed_by_email,
        duration: history?.duration_ms,
        historyId: history?.id,
        hidden: history?.hidden || false
      }
    }).filter(m => showHidden || !m.hidden)
  }, [migrationHistory, showHidden])

  const hideMigration = async (historyId) => {
    if (!isAdmin) return
    
    try {
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/migrations/history/${historyId}/hide`,
        { method: 'POST' },
        { requiresAuth: true }
      )
      
      if (data.success) {
        // Recharger l'historique
        const historyData = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/migrations/history',
          { method: 'GET' },
          { requiresAuth: true }
        )
        if (historyData.success) {
          setMigrationHistory(historyData.history || [])
        }
        logger.log('✅ Migration masquée avec succès')
      }
    } catch (err) {
      logger.error('Erreur masquage migration:', err)
    }
  }

  const deleteMigration = async (historyId) => {
    if (!isAdmin) return
    
    if (!confirm('⚠️ Êtes-vous sûr de vouloir supprimer définitivement cette migration de l\'historique ? Cette action est irréversible.')) {
      return
    }
    
    try {
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        `/api.php/migrations/history/${historyId}`,
        { method: 'DELETE' },
        { requiresAuth: true }
      )
      
      if (data.success) {
        // Recharger l'historique
        const historyData = await fetchJson(
          fetchWithAuth,
          API_URL,
          '/api.php/migrations/history',
          { method: 'GET' },
          { requiresAuth: true }
        )
        if (historyData.success) {
          setMigrationHistory(historyData.history || [])
        }
        logger.log('✅ Migration supprimée définitivement')
      }
    } catch (err) {
      logger.error('Erreur suppression migration:', err)
      setError('Erreur lors de la suppression de la migration: ' + (err.message || 'Erreur inconnue'))
    }
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold mb-2">🛠️ Migrations Base de Données</h1>
            <p className="text-gray-600 dark:text-gray-400">
              Exécutez des scripts SQL pour mettre à jour la base de données. 
              <strong className="text-red-600 dark:text-red-400"> Utilisez avec précaution !</strong>
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(e) => setShowHidden(e.target.checked)}
              className="rounded"
            />
            Afficher les migrations masquées
          </label>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-red-800 dark:text-red-200 font-semibold mb-2">❌ Erreur</p>
            <pre className="text-red-700 dark:text-red-300 text-sm mt-1 whitespace-pre-wrap font-mono bg-red-100 dark:bg-red-900/30 p-3 rounded overflow-x-auto">
              {error}
            </pre>
          </div>
        )}

        {result && (
          <div className={`mb-4 p-4 rounded-lg border ${
            result.success 
              ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
              : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
          }`}>
            <p className={`font-semibold ${result.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'}`}>
              {result.success ? '✅ Succès' : '❌ Erreur'}
            </p>
            <p className={`text-sm mt-1 ${result.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
              {result.message}
            </p>
            {result.logs && result.logs.length > 0 && (
              <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs">
                {result.logs.map((log, idx) => (
                  <div key={idx}>{log}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {loadingHistory ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            ⏳ Chargement de l'historique...
          </div>
        ) : (
          <div className="space-y-4">
            {migrations.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {showHidden ? 'Aucune migration (masquée ou non)' : 'Aucune migration disponible'}
              </div>
            ) : (
              migrations.map((migration) => (
                <div 
                  key={migration.id}
                  className={`p-4 border-2 rounded-lg transition-all ${
                    migration.executed 
                      ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20 shadow-sm' 
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{migration.name}</h3>
                        {migration.executed ? (
                          <span className="px-3 py-1 text-sm font-bold bg-green-500 text-white rounded-full shadow-sm flex items-center gap-1">
                            <span>✅</span>
                            <span>Poussée / Exécutée</span>
                          </span>
                        ) : (
                          <span className="px-3 py-1 text-sm font-bold bg-orange-500 text-white rounded-full shadow-sm flex items-center gap-1">
                            <span>⏳</span>
                            <span>Non poussée</span>
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        {migration.description}
                      </p>
                      {migration.executed && migration.executedAt && (
                        <div className="mb-2 p-2 bg-green-100 dark:bg-green-900/30 rounded text-xs text-green-800 dark:text-green-200">
                          <strong>📅 Exécutée le :</strong> {new Date(migration.executedAt).toLocaleString('fr-FR')}
                          {migration.executedBy && (
                            <>
                              <br />
                              <strong>👤 Par :</strong> {migration.executedBy}
                            </>
                          )}
                          {migration.duration && (
                            <>
                              <br />
                              <strong>⏱️ Durée :</strong> {parseFloat(migration.duration).toFixed(0)}ms
                            </>
                          )}
                        </div>
                      )}
                      <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                        {migration.id}
                      </code>
                    </div>
                    <div className="flex items-center gap-2">
                      {migration.executed && migration.historyId && (
                        <>
                          <button
                            onClick={() => hideMigration(migration.historyId)}
                            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors border border-gray-300 dark:border-gray-600 rounded"
                            title="Masquer cette migration du dashboard"
                          >
                            👁️ Masquer
                          </button>
                          <button
                            onClick={() => deleteMigration(migration.historyId)}
                            className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-200 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-red-300 dark:border-red-700 rounded"
                            title="Supprimer définitivement cette migration de l'historique"
                          >
                            🗑️ Supprimer
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => runMigration(migration.id)}
                        disabled={loading || migration.executed}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          migration.executed
                            ? 'bg-gray-400 cursor-not-allowed text-white'
                            : migration.variant === 'success'
                            ? 'bg-green-600 hover:bg-green-700 text-white'
                            : migration.variant === 'warning'
                            ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                            : 'bg-blue-600 hover:bg-blue-700 text-white'
                        }`}
                      >
                        {loading ? '⏳ Exécution...' : migration.executed ? '✅ Déjà exécutée' : migration.variant === 'success' ? '🔧 Réparer' : '🚀 Exécuter'}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}

