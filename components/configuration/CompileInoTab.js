'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import Modal from '@/components/Modal'
import logger from '@/lib/logger'

export default function CompileInoTab() {
  const { fetchWithAuth, API_URL, token } = useAuth()
  const [compiling, setCompiling] = useState(false)
  const [compileLogs, setCompileLogs] = useState([])
  const [compileProgress, setCompileProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [deletingFirmware, setDeletingFirmware] = useState(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [firmwareToDelete, setFirmwareToDelete] = useState(null)
  const [compileWindowMinimized, setCompileWindowMinimized] = useState(false)
  const [compileHistory, setCompileHistory] = useState([]) // Historique des compilations
  const [copySuccess, setCopySuccess] = useState(false)
  const compileLogsRef = useRef(null)
  const eventSourceRef = useRef(null)

  const { data, loading, refetch } = useApiData(
    ['/api.php/firmwares'],
    { requiresAuth: true }
  )

  const firmwares = data?.firmwares?.firmwares || []

  // Compiler le firmware
  const handleCompile = useCallback(async (uploadId) => {
    if (!uploadId) return

    setCompiling(true)
    setCurrentStep('compilation')
    setCompileLogs([])
    setCompileProgress(0)
    setError(null)
    setSuccess(null)

    try {
      if (!token) {
        throw new Error('Token manquant. Veuillez vous reconnecter.')
      }

      const eventSource = new EventSource(
        `${API_URL}/api.php/firmwares/compile/${uploadId}?token=${encodeURIComponent(token)}`
      )

      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        logger.log('✅ Connexion SSE établie')
        setCompileLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: 'Connexion établie, démarrage de la compilation...',
          level: 'info'
        }])
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'log') {
            setCompileLogs(prev => [...prev, { 
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: data.message,
              level: data.level || 'info'
            }])
            setTimeout(() => {
              if (compileLogsRef.current) {
                compileLogsRef.current.scrollTop = compileLogsRef.current.scrollHeight
              }
            }, 100)
          } else if (data.type === 'progress') {
            setCompileProgress(data.progress || 0)
          } else if (data.type === 'success') {
            setSuccess(`✅ Compilation réussie ! Firmware v${data.version} disponible`)
            // Sauvegarder dans l'historique avant de réinitialiser
            setCompileHistory(prev => [...prev, {
              id: Date.now(),
              timestamp: new Date().toISOString(),
              logs: [...compileLogs],
              progress: compileProgress,
              status: 'success',
              version: data.version
            }])
            setCompiling(false)
            setCurrentStep(null)
            setCompileProgress(0)
            if (eventSourceRef.current) {
              eventSourceRef.current.close()
              eventSourceRef.current = null
            }
            refetch()
          } else if (data.type === 'error') {
            setError(data.message || 'Erreur lors de la compilation')
            setCompiling(false)
            setCurrentStep(null)
            setCompileProgress(0)
            if (eventSourceRef.current) {
              eventSourceRef.current.close()
              eventSourceRef.current = null
            }
          }
        } catch (err) {
          logger.error('Erreur parsing EventSource:', err)
        }
      }

      eventSource.onerror = (err) => {
        logger.error('EventSource error:', err)
        
        // Vérifier l'état de la connexion
        if (eventSource.readyState === EventSource.CLOSED) {
          // Connexion fermée - peut être normale si la compilation est terminée
          // Vérifier si on a reçu un message de succès ou d'erreur avant
          const lastLog = compileLogs[compileLogs.length - 1]
          if (!lastLog || (!lastLog.message.includes('✅') && !lastLog.message.includes('❌'))) {
            setError('Connexion fermée inattendue. La compilation peut avoir échoué ou pris trop de temps.')
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: '⚠️ Connexion fermée - Vérifiez l\'état de la compilation dans la liste des firmwares',
              level: 'warning'
            }])
          }
        } else if (eventSource.readyState === EventSource.CONNECTING) {
          // En train de se reconnecter
          setCompileLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('fr-FR'),
            message: '🔄 Reconnexion en cours...',
            level: 'info'
          }])
          return // Ne pas fermer, laisser la reconnexion se faire
        } else {
          // Erreur de connexion
          setError('Erreur de connexion lors de la compilation. La compilation peut toujours être en cours sur le serveur.')
          setCompileLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('fr-FR'),
            message: '⚠️ Erreur de connexion - Vérifiez l\'état de la compilation dans la liste des firmwares',
            level: 'error'
          }])
        }
        
        setCompiling(false)
        setCurrentStep(null)
        setCompileProgress(0)
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
        
        // Rafraîchir la liste des firmwares pour voir l'état actuel
        setTimeout(() => {
          refetch()
        }, 2000)
      }

    } catch (err) {
      logger.error('Erreur lors du démarrage de la compilation:', err)
      setError(err.message || 'Erreur lors du démarrage de la compilation')
      setCompiling(false)
      setCurrentStep(null)
      setCompileProgress(0)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [API_URL, refetch, token, compileLogs, compileProgress])

  // Nettoyer EventSource au démontage
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  // Auto-scroll des logs
  useEffect(() => {
    if (compileLogsRef.current && compiling) {
      compileLogsRef.current.scrollTop = compileLogsRef.current.scrollHeight
    }
  }, [compileLogs, compiling])

  // Copier les logs de compilation
  const handleCopyLogs = useCallback(() => {
    if (compileLogs.length === 0) {
      return
    }

    const logsText = compileLogs.map(log => 
      `[${log.timestamp}] ${log.message}`
    ).join('\n')

    navigator.clipboard.writeText(logsText).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }).catch(err => {
      logger.error('Erreur lors de la copie des logs:', err)
      setError('Erreur lors de la copie des logs')
    })
  }, [compileLogs, logger])

  return (
    <div className="space-y-6">
      {/* Section Compilation avec logs */}
      {(compiling || compileLogs.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">🔨 Compilation en cours</h2>
            <div className="flex items-center gap-2">
              {compileProgress > 0 && (
                <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                  {compileProgress}%
                </span>
              )}
              {compileLogs.length > 0 && (
                <button
                  onClick={handleCopyLogs}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  title="Copier les logs"
                >
                  {copySuccess ? '✅ Copié!' : '📋 Copier'}
                </button>
              )}
              <button
                onClick={() => setCompileWindowMinimized(!compileWindowMinimized)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                title={compileWindowMinimized ? 'Afficher les logs' : 'Masquer les logs'}
              >
                {compileWindowMinimized ? '⬆️' : '⬇️'}
              </button>
            </div>
          </div>
          
          {!compileWindowMinimized && (
            <>
              {/* Barre de progression */}
              {compileProgress > 0 && (
                <div className="space-y-2 mb-4">
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all duration-300 ${
                        compiling ? 'bg-blue-500' :
                        compileProgress === 100 ? 'bg-green-500' :
                        'bg-gray-300 dark:bg-gray-600'
                      }`}
                      style={{ 
                        width: `${Math.max(0, Math.min(100, compileProgress))}%` 
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Logs de compilation */}
              <div
                ref={compileLogsRef}
                className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-96 overflow-y-auto"
              >
                {compileLogs.length === 0 ? (
                  <div className="text-gray-500">En attente des logs...</div>
                ) : (
                  compileLogs.map((log, idx) => (
                    <div key={idx} className="mb-1">
                      <span className="text-gray-500 pr-3">{log.timestamp}</span>
                      <span className={log.level === 'error' ? 'text-red-400' : log.level === 'warning' ? 'text-yellow-400' : 'text-green-300'}>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Messages d'erreur et succès */}
      {error && <ErrorMessage error={error} />}
      {success && <SuccessMessage message={success} />}

      {/* Liste des firmwares */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">📦 Firmwares disponibles</h2>
        
        {loading ? (
          <LoadingSpinner />
        ) : firmwares.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">Aucun firmware disponible. Uploader un fichier .ino dans l'onglet "INO" pour commencer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Version</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Taille</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Statut</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {firmwares.map((fw) => (
                  <tr key={fw.id} className="table-row">
                    <td className="py-3 px-4">
                      <span className="font-mono font-semibold text-primary">v{fw.version}</span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {fw.file_size ? `${(fw.file_size / 1024).toFixed(2)} KB` : '-'}
                    </td>
                    <td className="py-3 px-4">
                      {fw.status && (
                        <span className={`badge ${
                          fw.status === 'pending_compilation' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300' : 
                          fw.status === 'compiling' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                          fw.status === 'compiled' ? 'badge-success' :
                          fw.status === 'error' ? 'badge-danger' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        } text-xs`}>
                          {fw.status === 'pending_compilation' ? 'En attente' : 
                           fw.status === 'compiling' ? 'Compilation' :
                           fw.status === 'compiled' ? 'Compilé' :
                           fw.status === 'error' ? 'Erreur' : fw.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {new Date(fw.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {fw.status === 'pending_compilation' && (
                          <button
                            onClick={() => handleCompile(fw.id)}
                            disabled={compiling}
                            className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                            title="Compiler le firmware"
                          >
                            <span className="text-lg">🔨</span>
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setFirmwareToDelete(fw)
                            setShowDeleteConfirmModal(true)
                          }}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                          title="Supprimer le firmware"
                        >
                          <span className="text-lg">🗑️</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal confirmation suppression */}
      <Modal
        isOpen={showDeleteConfirmModal}
        onClose={() => {
          setShowDeleteConfirmModal(false)
          setFirmwareToDelete(null)
        }}
        title="Confirmer la suppression"
        maxWidth="max-w-md"
      >
        {firmwareToDelete && (
          <div className="space-y-4">
            <p className="text-gray-700 dark:text-gray-300">
              Êtes-vous sûr de vouloir supprimer le firmware <strong>v{firmwareToDelete.version}</strong> ?
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Cette action est irréversible.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowDeleteConfirmModal(false)
                  setFirmwareToDelete(null)
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  if (!firmwareToDelete) return
                  
                  setDeletingFirmware(firmwareToDelete.id)
                  try {
                    const response = await fetchWithAuth(
                      `${API_URL}/api.php/firmwares/${firmwareToDelete.id}`,
                      { method: 'DELETE' },
                      { requiresAuth: true }
                    )
                    
                    if (response.status === 404) {
                      const errorData = await response.json().catch(() => ({}))
                      throw new Error(`Erreur système: ${errorData.error || 'Endpoint non disponible'}`)
                    }
                    
                    if (!response.ok) {
                      const errorData = await response.json().catch(() => ({}))
                      throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
                    }
                    
                    const data = await response.json()
                    if (!data.success) {
                      throw new Error(data.error || 'Erreur lors de la suppression')
                    }
                    
                    setSuccess(`Firmware v${firmwareToDelete.version} supprimé avec succès`)
                    setShowDeleteConfirmModal(false)
                    setFirmwareToDelete(null)
                    refetch()
                  } catch (err) {
                    const errorMsg = err.message?.includes('404') || err.message?.includes('Endpoint not found')
                      ? '⚠️ L\'endpoint de suppression n\'est pas disponible sur le serveur.'
                      : `Erreur lors de la suppression : ${err.message}`
                    setError(errorMsg)
                    setShowDeleteConfirmModal(false)
                    setFirmwareToDelete(null)
                  } finally {
                    setDeletingFirmware(null)
                  }
                }}
                disabled={deletingFirmware === firmwareToDelete?.id}
                className="btn-danger"
              >
                {deletingFirmware === firmwareToDelete?.id ? '⏳ Suppression...' : '🗑️ Supprimer'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

