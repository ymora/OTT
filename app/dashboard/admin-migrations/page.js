'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useApiCall } from '@/hooks'
import logger from '@/lib/logger'
import { fetchJson } from '@/lib/api'
import Modal from '@/components/Modal'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import LoadingSpinner from '@/components/LoadingSpinner'
import { isAdmin as checkIsAdmin } from '@/lib/userUtils'

export default function AdminMigrationsPage() {
  const { user, fetchWithAuth, API_URL } = useAuth()
  const [result, setResult] = useState(null)
  const [migrationHistory, setMigrationHistory] = useState([])
  const [showHidden, setShowHidden] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [success, setSuccess] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [deletingMigration, setDeletingMigration] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [migrationToDelete, setMigrationToDelete] = useState(null)
  // Utiliser useApiCall pour simplifier la gestion des appels API
  const { loading, error, call, setError } = useApiCall({ requiresAuth: true, autoReset: false })

  const userIsAdmin = checkIsAdmin(user)

  // Liste des migrations disponibles (définie avant le return conditionnel pour respecter les règles des hooks)
  // NOTE: Liste vide - toutes les migrations ont été supprimées car plus nécessaires
  const migrationsList = []

  // Enrichir les migrations avec l'historique (défini avant le return conditionnel)
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
        status: history?.status,
        hidden: history?.hidden || false
      }
    }).filter(m => showHidden || !m.hidden)
  }, [migrationHistory, showHidden])

  // Charger l'historique des migrations
  useEffect(() => {
    if (!userIsAdmin) return
    
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
  }, [userIsAdmin, fetchWithAuth, API_URL])

  const runMigration = async (migrationFile) => {
    if (!userIsAdmin) {
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

  if (!userIsAdmin) {
    return (
      <div className="card">
        <div className="alert alert-warning">
          <p>❌ Accès refusé : Cette page est réservée aux administrateurs.</p>
        </div>
      </div>
    )
  }

  const hideMigration = async (historyId) => {
    if (!userIsAdmin) return
    
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

  const openDeleteModal = (migration) => {
    // Toujours ouvrir le modal, même si pas de historyId
    // Le modal gérera l'affichage du message approprié
    setMigrationToDelete(migration)
    setShowDeleteModal(true)
    setActionError(null)
  }

  const closeDeleteModal = () => {
    setShowDeleteModal(false)
    setMigrationToDelete(null)
    setActionError(null)
  }

  const deleteMigration = async () => {
    if (!userIsAdmin) return
    
    try {
      setActionError(null)
      
      // Si pas de historyId, supprimer le fichier directement
      if (!migrationToDelete?.historyId) {
        // Supprimer le fichier SQL du serveur
        setDeletingMigration('file')
        
        const data = await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/migrations/file/${encodeURIComponent(migrationToDelete.id)}`,
          { method: 'DELETE' },
          { requiresAuth: true }
        )
        
        if (data.success) {
          setSuccess('Fichier de migration supprimé définitivement du serveur')
          logger.log('✅ Fichier de migration supprimé définitivement')
          closeDeleteModal()
          // Recharger la page pour mettre à jour la liste
          window.location.reload()
        } else {
          throw new Error(data.error || 'Erreur lors de la suppression de la migration')
        }
      } else {
        // Supprimer l'entrée de l'historique
        setDeletingMigration(migrationToDelete.historyId)
        
        const data = await fetchJson(
          fetchWithAuth,
          API_URL,
          `/api.php/migrations/history/${migrationToDelete.historyId}`,
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
          setSuccess('Migration supprimée définitivement de l\'historique')
          logger.log('✅ Migration supprimée définitivement')
          closeDeleteModal()
        }
      }
    } catch (err) {
      logger.error('Erreur suppression migration:', err)
      
      // Construire un message d'erreur détaillé
      let errorMessage = err.message || err.error || 'Erreur inconnue'
      
      // Ajouter les détails si disponibles
      if (err.details) {
        errorMessage += ` (Détails: ${JSON.stringify(err.details)})`
      }
      if (err.debug) {
        errorMessage += ` (Debug: ${JSON.stringify(err.debug)})`
      }
      if (err.logs && Array.isArray(err.logs)) {
        errorMessage += ` (Logs: ${err.logs.join(', ')})`
      }
      
      setActionError('Erreur lors de la suppression de la migration: ' + errorMessage)
      
      // Logger aussi les détails complets pour debug
      logger.error('Détails complets de l\'erreur:', {
        message: err.message,
        error: err.error,
        details: err.details,
        debug: err.debug,
        logs: err.logs,
        stack: err.stack
      })
    } finally {
      setDeletingMigration(null)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold">🛠️ Migrations Base de Données</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">
          Exécutez des scripts SQL pour mettre à jour la base de données. 
          <strong className="text-red-600 dark:text-red-400"> Utilisez avec précaution !</strong>
        </p>
      </div>

      {/* Toggle pour afficher les migrations masquées */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showHidden}
            onChange={(e) => setShowHidden(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            🗄️ Afficher les migrations masquées
          </span>
        </label>
      </div>

      <div className="card">
        <ErrorMessage error={error} onClose={() => setError(null)} />
        <ErrorMessage error={actionError} onClose={() => setActionError(null)} />
        <SuccessMessage message={success} onClose={() => setSuccess(null)} />
        
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
          <LoadingSpinner size="lg" text="Chargement de l'historique..." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Nom</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Description</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Statut</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Exécutée le</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Par</th>
                  <th className="text-left py-3 px-4 text-gray-700 dark:text-gray-300">Fichier</th>
                  <th className="text-right py-3 px-4 text-gray-700 dark:text-gray-300">Actions</th>
                </tr>
              </thead>
              <tbody>
                {migrations.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-gray-500 dark:text-gray-400">
                      {showHidden ? 'Aucune migration (masquée ou non)' : 'Aucune migration disponible'}
                    </td>
                  </tr>
                ) : (
                  migrations.map((migration, i) => (
                    <tr 
                      key={migration.id} 
                      className={`table-row animate-slide-up hover:bg-gray-50 dark:hover:bg-gray-800 ${migration.hidden ? 'opacity-60' : ''}`}
                      style={{animationDelay: `${i * 0.05}s`}}
                    >
                      <td className="table-cell py-3 px-4 font-medium">
                        <div className="flex items-center gap-2">
                          <span>{migration.name}</span>
                        </div>
                      </td>
                      <td className="table-cell py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                        {migration.description}
                      </td>
                      <td className="table-cell py-3 px-4">
                        {migration.executed ? (
                          <span className="badge badge-success">✅ Exécutée</span>
                        ) : migration.historyId ? (
                          <span className="badge bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                            ⚠️ Échouée
                          </span>
                        ) : (
                          <span className="badge bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            ⏳ Non exécutée
                          </span>
                        )}
                      </td>
                      <td className="table-cell py-3 px-4 text-sm">
                        {migration.executedAt 
                          ? new Date(migration.executedAt).toLocaleString('fr-FR', { 
                              day: '2-digit', 
                              month: '2-digit', 
                              year: 'numeric',
                              hour: '2-digit', 
                              minute: '2-digit' 
                            })
                          : '-'}
                      </td>
                      <td className="table-cell py-3 px-4 text-sm">
                        {migration.executedBy || '-'}
                      </td>
                      <td className="table-cell py-3 px-4">
                        <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          {migration.id}
                        </code>
                      </td>
                      <td className="table-cell py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {migration.historyId && (
                            <button
                              onClick={() => hideMigration(migration.historyId)}
                              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                              title="Masquer cette migration du dashboard"
                            >
                              <span className="text-lg">👁️</span>
                            </button>
                          )}
                          <button
                            onClick={() => openDeleteModal(migration)}
                            disabled={deletingMigration === migration.historyId || deletingMigration === 'file'}
                            className="p-2 rounded-lg transition-colors disabled:opacity-50 hover:bg-red-100 dark:hover:bg-red-900/30"
                            title={
                              migration.historyId 
                                ? "Supprimer définitivement cette migration de l'historique" 
                                : "Supprimer le fichier de migration du serveur"
                            }
                          >
                            <span className="text-lg">{deletingMigration === migration.historyId || deletingMigration === 'file' ? '⏳' : '🗑️'}</span>
                          </button>
                          <button
                            onClick={() => runMigration(migration.id)}
                            disabled={loading || migration.executed}
                            className={`p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              migration.executed
                                ? 'bg-gray-400 cursor-not-allowed text-white'
                                : migration.variant === 'success'
                                ? 'bg-green-600 hover:bg-green-700 text-white'
                                : migration.variant === 'warning'
                                ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                : 'bg-blue-600 hover:bg-blue-700 text-white'
                            }`}
                            title={migration.executed ? 'Déjà exécutée' : migration.variant === 'success' ? 'Réparer' : 'Exécuter'}
                          >
                            <span className="text-lg">
                              {loading ? '⏳' : migration.executed ? '✅' : migration.variant === 'success' ? '🔧' : '🚀'}
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal de confirmation de suppression */}
      <Modal
        isOpen={showDeleteModal}
        onClose={closeDeleteModal}
        title="🗑️ Supprimer la migration"
      >
        {migrationToDelete && (
          <>
            {actionError && (
              <div className="alert alert-warning mb-4">
                {actionError}
              </div>
            )}

            <div className="mb-4">
              {migrationToDelete.historyId ? (
                <>
                  <p className="text-gray-700 dark:text-gray-300 mb-2">
                    Êtes-vous sûr de vouloir supprimer définitivement cette migration de l&apos;historique ?
                  </p>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <p className="font-medium text-primary">
                      {migrationToDelete.name}
                    </p>
                    <p className="text-xs text-muted font-mono mt-1">
                      {migrationToDelete.id}
                    </p>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-3">
                    ⚠️ Cette action est irréversible.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-gray-700 dark:text-gray-300 mb-2">
                    Êtes-vous sûr de vouloir supprimer définitivement ce fichier de migration du serveur ?
                  </p>
                  <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                    <p className="font-medium text-primary">
                      {migrationToDelete.name}
                    </p>
                    <p className="text-xs text-muted font-mono mt-1">
                      {migrationToDelete.id}
                    </p>
                  </div>
                  <p className="text-sm text-red-600 dark:text-red-400 mt-3">
                    ⚠️ Cette action est irréversible. Le fichier sera supprimé du serveur.
                  </p>
                </>
              )}
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="btn-secondary"
                onClick={closeDeleteModal}
                disabled={deletingMigration === migrationToDelete.historyId || deletingMigration === 'file'}
              >
                Annuler
              </button>
              <button
                className="btn-primary bg-red-600 hover:bg-red-700"
                onClick={deleteMigration}
                disabled={deletingMigration === migrationToDelete.historyId || deletingMigration === 'file'}
              >
                {deletingMigration === migrationToDelete.historyId || deletingMigration === 'file' ? '⏳ Suppression...' : '🗑️ Supprimer'}
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  )
}

