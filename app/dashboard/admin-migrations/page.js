'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiCall } from '@/hooks'
import logger from '@/lib/logger'

export default function AdminMigrationsPage() {
  const { user } = useAuth()
  const [result, setResult] = useState(null)
  // Utiliser useApiCall pour simplifier la gestion des appels API
  const { loading, error, call, setError } = useApiCall({ requiresAuth: true, autoReset: false })

  const isAdmin = user?.role_name === 'admin' || user?.role === 'admin' || user?.roles?.includes('admin')

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

  const migrations = [
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
    }
  ]

  return (
    <div className="space-y-6">
      <div className="card">
        <h1 className="text-2xl font-bold mb-2">🛠️ Migrations Base de Données</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Exécutez des scripts SQL pour mettre à jour la base de données. 
          <strong className="text-red-600 dark:text-red-400"> Utilisez avec précaution !</strong>
        </p>

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

        <div className="space-y-4">
          {migrations.map((migration) => (
            <div 
              key={migration.id}
              className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-1">{migration.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    {migration.description}
                  </p>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                    {migration.id}
                  </code>
                </div>
                <button
                  onClick={() => runMigration(migration.id)}
                  disabled={loading}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    migration.variant === 'success'
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : migration.variant === 'warning'
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {loading ? '⏳ Exécution...' : migration.variant === 'success' ? '🔧 Réparer' : '🚀 Exécuter'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

