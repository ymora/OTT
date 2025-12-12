'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

export default function AdminMigrationsPage() {
  const { fetchWithAuth, API_URL, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const isAdmin = user?.role_name === 'admin' || user?.role === 'admin' || user?.roles?.includes('admin')

  const runMigration = async (migrationFile) => {
    if (!isAdmin) {
      setError('Accès refusé : administrateur requis')
      return
    }

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const data = await fetchJson(
        fetchWithAuth,
        API_URL,
        '/api.php/migrate',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ file: migrationFile })
        },
        { requiresAuth: true }
      )

      if (data.success) {
        setResult({
          success: true,
          message: data.message || 'Migration exécutée avec succès',
          logs: data.logs || []
        })
        logger.log(`✅ Migration ${migrationFile} exécutée avec succès`)
      } else {
        setError(data.error || 'Erreur lors de l\'exécution de la migration')
      }
    } catch (err) {
      logger.error('Erreur migration:', err)
      // Afficher des détails plus précis
      let errorMessage = err.message || 'Erreur lors de l\'exécution de la migration'
      
      // Si on a des logs, les utiliser pour un message plus détaillé
      if (err.logs && Array.isArray(err.logs) && err.logs.length > 0) {
        errorMessage = err.logs.join('\n')
      } else {
        // Sinon, construire le message avec les détails disponibles
        if (err.details) {
          if (Array.isArray(err.details)) {
            errorMessage += '\n' + err.details.join('\n')
          } else if (typeof err.details === 'object') {
            errorMessage += '\nDétails: ' + JSON.stringify(err.details, null, 2)
          } else {
            errorMessage += '\nDétails: ' + err.details
          }
        }
        if (err.code) {
          errorMessage += `\nCode erreur: ${err.code}`
        }
      }
      
      setError(errorMessage)
      
      // Afficher aussi dans la console pour debug
      console.error('Erreur migration complète:', {
        message: err.message,
        details: err.details,
        code: err.code,
        logs: err.logs,
        stack: err.stack
      })
    } finally {
      setLoading(false)
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
      id: 'migration_add_measurements_deleted_at.sql',
      name: 'Ajouter deleted_at à measurements',
      description: 'Ajoute la colonne deleted_at pour permettre l\'archivage des mesures historiques',
      variant: 'info'
    },
    {
      id: 'migration_cleanup_device_names.sql',
      name: 'Nettoyer les noms de dispositifs',
      description: 'Enlève le nom du patient des device_name pour éviter la redondance (OTT-25-Jacques Bernard → OTT-25)',
      variant: 'warning'
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
            <p className="text-red-800 dark:text-red-200 font-semibold">❌ Erreur</p>
            <p className="text-red-700 dark:text-red-300 text-sm mt-1">{error}</p>
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
                    migration.variant === 'warning'
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {loading ? '⏳ Exécution...' : '🚀 Exécuter'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

