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
  const [compilingFirmwareId, setCompilingFirmwareId] = useState(null)
  const compileLogsRef = useRef(null)
  const eventSourceRef = useRef(null)
  const reconnectAttemptedRef = useRef(false)

  const { data, loading, refetch } = useApiData(
    ['/api.php/firmwares'],
    { requiresAuth: true }
  )

  const firmwares = data?.firmwares?.firmwares || []
  
  // Fonctions utilitaires
  const closeEventSource = useCallback(() => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
  }, [])
  
  const resetCompilationState = useCallback(() => {
    setCompiling(false)
    setCompilingFirmwareId(null)
    setCurrentStep(null)
    setCompileProgress(0)
    closeEventSource()
  }, [closeEventSource])
  
  const addLog = useCallback((message, level = 'info') => {
    setCompileLogs(prev => {
      // Ne filtrer que les messages exactement identiques consécutifs
      const lastLog = prev[prev.length - 1]
      if (lastLog && lastLog.message === message && lastLog.level === level) {
        return prev
      }
      return [...prev, {
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        message,
        level
      }]
    })
  }, [])

  // Compiler le firmware
  const handleCompile = useCallback(async (uploadId) => {
    if (!uploadId) return
    
    // Éviter les appels multiples pour le même firmware
    if (compiling && compilingFirmwareId === uploadId && eventSourceRef.current) {
      return
    }
    
    // Fermer l'ancienne connexion si elle existe
    closeEventSource()

    setCompiling(true)
    setCompilingFirmwareId(uploadId)
    setCurrentStep('compilation')
    // Ajouter un message initial immédiatement pour qu'il s'affiche
    setCompileLogs([{
      timestamp: new Date().toLocaleTimeString('fr-FR'),
      message: '⏳ Connexion au serveur...',
      level: 'info'
    }])
    setCompileProgress(0)
    setError(null)
    setSuccess(null)
    reconnectAttemptedRef.current = false

    try {
      if (!token) {
        throw new Error('Token manquant. Veuillez vous reconnecter.')
      }

      const sseUrl = `${API_URL}/api.php/firmwares/compile/${uploadId}?token=${encodeURIComponent(token)}`
      
      // Logs détaillés pour le diagnostic
      logger.log('═══════════════════════════════════════════════════════')
      logger.log('🔌 DÉMARRAGE COMPILATION FIRMWARE')
      logger.log('═══════════════════════════════════════════════════════')
      logger.log('📦 Firmware ID:', uploadId)
      logger.log('🌐 API URL:', API_URL)
      logger.log('🔗 URL SSE complète:', sseUrl)
      logger.log('🔑 Token présent:', !!token, `(${token ? token.length : 0} caractères)`)
      logger.log('⏰ Timestamp:', new Date().toISOString())
      logger.log('═══════════════════════════════════════════════════════')

      const eventSource = new EventSource(sseUrl)
      
      logger.log('📡 EventSource créé')
      logger.log('   readyState:', eventSource.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSED)')
      logger.log('   URL:', eventSource.url)

      eventSourceRef.current = eventSource

      // Log immédiatement l'état de la connexion
      setTimeout(() => {
        logger.log('⏱️ [100ms] État de la connexion:')
        logger.log('   readyState:', eventSource.readyState, '(0=CONNECTING, 1=OPEN, 2=CLOSED)')
        if (eventSource.readyState === EventSource.CONNECTING) {
          logger.log('   ⚠️ Toujours en connexion... (normal si le serveur est lent)')
        } else if (eventSource.readyState === EventSource.OPEN) {
          logger.log('   ✅ Connexion ouverte avec succès!')
        } else if (eventSource.readyState === EventSource.CLOSED) {
          logger.error('   ❌ Connexion fermée après 100ms!')
          logger.error('   🔍 Causes possibles:')
          logger.error('      • Token expiré ou invalide')
          logger.error('      • Serveur inaccessible')
          logger.error('      • Erreur d\'authentification')
          logger.error('      • Timeout du serveur')
        }
      }, 100)
      
      // Vérifier aussi après 2 secondes
      setTimeout(() => {
        logger.log('⏱️ [2s] État de la connexion:')
        logger.log('   readyState:', eventSource.readyState)
        if (eventSource.readyState === EventSource.CONNECTING) {
          logger.error('   ❌ Toujours en connexion après 2s - problème de connexion!')
          logger.error('   🔍 Vérifiez:')
          logger.error('      • La connexion réseau')
          logger.error('      • Que le serveur Render est accessible')
          logger.error('      • Les logs du serveur pour plus de détails')
          setCompileLogs(prev => {
            const lastMsg = prev[prev.length - 1]?.message
            if (!lastMsg || !lastMsg.includes('problème de connexion')) {
              return [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: '❌ Problème de connexion au serveur - Vérifiez votre connexion réseau',
                level: 'error'
              }]
            }
            return prev
          })
        }
      }, 2000)

      eventSource.onopen = () => {
        logger.log('═══════════════════════════════════════════════════════')
        logger.log('✅ CONNEXION SSE ÉTABLIE!')
        logger.log('   readyState:', eventSource.readyState, '(devrait être 1=OPEN)')
        logger.log('   URL:', eventSource.url)
        logger.log('   ⏰ Timestamp:', new Date().toISOString())
        logger.log('═══════════════════════════════════════════════════════')
        reconnectAttemptedRef.current = false
        // Mettre à jour le message initial
        setCompileLogs(prev => {
          if (prev.length === 1 && prev[0].message.includes('Connexion au serveur')) {
            return [{
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: '✅ Connexion établie, démarrage de la compilation...',
              level: 'info'
            }]
          }
          return prev
        })
      }

      eventSource.onmessage = (event) => {
        logger.log('📥 [SSE] Message brut reçu:', event.data?.substring(0, 150))
        
        try {
          // Ignorer uniquement les messages keep-alive (commentaires SSE qui commencent par :)
          if (!event.data || event.data.trim() === '' || event.data.trim().startsWith(':')) {
            logger.log('⏭️ [SSE] Message ignoré (keep-alive ou vide)')
            return
          }
          
          const data = JSON.parse(event.data)
          logger.log('📨 [SSE] Message parsé:')
          logger.log('   Type:', data.type)
          logger.log('   Contenu:', data.message || `Progress: ${data.progress}%` || JSON.stringify(data))
          
          if (data.type === 'log') {
            // Ajouter directement le log pour qu'il soit immédiatement visible
            setCompileLogs(prev => {
              const newLog = {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: data.message,
                level: data.level || 'info'
              }
              // Ne filtrer que les messages exactement identiques consécutifs
              const lastLog = prev[prev.length - 1]
              if (lastLog && lastLog.message === newLog.message && lastLog.level === newLog.level) {
                return prev
              }
              return [...prev, newLog]
            })
            // Auto-scroll vers le bas
            setTimeout(() => {
              if (compileLogsRef.current) {
                compileLogsRef.current.scrollTop = compileLogsRef.current.scrollHeight
              }
            }, 100)
          } else if (data.type === 'progress') {
            setCompileProgress(data.progress || 0)
          } else if (data.type === 'success') {
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `✅ Compilation réussie ! Firmware v${data.version} disponible`,
              level: 'info'
            }])
            setSuccess(`✅ Compilation réussie ! Firmware v${data.version} disponible`)
            setCompileHistory(prev => [...prev, {
              id: Date.now(),
              timestamp: new Date().toISOString(),
              version: data.version,
              status: 'success'
            }])
            resetCompilationState()
            refetch()
          } else if (data.type === 'error') {
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: data.message || 'Erreur lors de la compilation',
              level: 'error'
            }])
            setError(data.message || 'Erreur lors de la compilation')
            resetCompilationState()
          }
        } catch (err) {
          logger.error('❌ Erreur parsing EventSource:', err, 'Data reçu:', event.data)
          // Afficher le message brut si le parsing échoue
          if (event.data && event.data.trim() && !event.data.trim().startsWith(':')) {
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `⚠️ Message non parsé: ${event.data.substring(0, 100)}`,
              level: 'warning'
            }])
          }
        }
      }

      eventSource.onerror = (error) => {
        const state = eventSource.readyState
        logger.error('═══════════════════════════════════════════════════════')
        logger.error('❌ ERREUR EVENTSOURCE DÉTECTÉE!')
        logger.error('═══════════════════════════════════════════════════════')
        logger.error('   ReadyState:', state, '(0=CONNECTING, 1=OPEN, 2=CLOSED)')
        logger.error('   Error object:', error)
        logger.error('   URL:', sseUrl)
        logger.error('   Timestamp:', new Date().toISOString())
        logger.error('═══════════════════════════════════════════════════════')
        
        // Afficher aussi dans les logs de compilation pour que l'utilisateur le voie
        setCompileLogs(prev => {
          const errorMsg = state === EventSource.CLOSED 
            ? '❌ Connexion fermée - Impossible de se connecter au serveur'
            : state === EventSource.CONNECTING
            ? '🔄 Tentative de reconnexion...'
            : '⚠️ Erreur de connexion au serveur'
          
          const lastMsg = prev[prev.length - 1]?.message
          if (!lastMsg || !lastMsg.includes(errorMsg)) {
            return [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: errorMsg,
              level: 'error'
            }]
          }
          return prev
        })
        
        if (state === EventSource.CLOSED) {
          setCompileLogs(prev => {
            const lastLog = prev[prev.length - 1]
            const hasFinalMessage = lastLog && (lastLog.message.includes('✅') || lastLog.message.includes('❌'))
            
            if (hasFinalMessage) {
              resetCompilationState()
              return prev
            }
            
            const warningMsg = '⚠️ Connexion fermée - La compilation continue en arrière-plan. Revenez sur cet onglet pour voir les logs.'
            const lastMsg = prev[prev.length - 1]?.message
            if (!lastMsg || !lastMsg.includes('Connexion fermée')) {
              return [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: warningMsg,
                level: 'warning'
              }]
            }
            return prev
          })
        } else if (state === EventSource.CONNECTING) {
          logger.log('🔄 EventSource se reconnecte...')
          setCompileLogs(prev => {
            const lastMsg = prev[prev.length - 1]?.message
            if (!lastMsg || !lastMsg.includes('Reconnexion')) {
              return [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: '🔄 Reconnexion en cours...',
                level: 'info'
              }]
            }
            return prev
          })
          return
        } else {
          logger.log('⚠️ EventSource en état OPEN mais avec erreur')
          setCompileLogs(prev => {
            const lastMsg = prev[prev.length - 1]?.message
            if (!lastMsg || !lastMsg.includes('Erreur de connexion')) {
              return [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: '⚠️ Erreur de connexion - La compilation continue sur le serveur. Vérifiez l\'état dans la liste des firmwares.',
                level: 'warning'
              }]
            }
            return prev
          })
        }
        
        setTimeout(() => refetch(), 2000)
      }

    } catch (err) {
      logger.error('Erreur lors du démarrage de la compilation:', err)
      setError(err.message || 'Erreur lors du démarrage de la compilation')
      resetCompilationState()
    }
  }, [API_URL, token, compiling, compilingFirmwareId, closeEventSource, resetCompilationState, addLog])

  // Ne pas fermer l'EventSource au démontage si une compilation est en cours
  useEffect(() => {
    return () => {
      if (eventSourceRef.current && !compiling) {
        closeEventSource()
      }
    }
  }, [compiling, closeEventSource])
  
  // Reconnexion automatique si une compilation est en cours
  useEffect(() => {
    if (compiling || eventSourceRef.current) return
    
    const compilingFirmware = firmwares.find(fw => fw.status === 'compiling')
    
    if (compilingFirmware) {
      const firmwareId = compilingFirmware.id
      if (reconnectAttemptedRef.current !== firmwareId) {
        reconnectAttemptedRef.current = firmwareId
        setCompilingFirmwareId(firmwareId)
        handleCompile(firmwareId)
      }
    } else if (compilingFirmwareId) {
      reconnectAttemptedRef.current = false
    }
  }, [firmwares, compiling, compilingFirmwareId, handleCompile])
  
  // Polling de secours si pas de connexion SSE active
  useEffect(() => {
    if (!compiling || eventSourceRef.current) return
    
    const pollingInterval = setInterval(() => {
      refetch().then(() => {
        const compilingFirmware = firmwares.find(fw => fw.id === compilingFirmwareId && fw.status === 'compiling')
        if (!compilingFirmware && compilingFirmwareId) {
          resetCompilationState()
        }
      })
    }, 5000)
    
    return () => clearInterval(pollingInterval)
  }, [compiling, compilingFirmwareId, firmwares, refetch, resetCompilationState])

  // Auto-scroll des logs
  useEffect(() => {
    if (compileLogsRef.current && compiling && compileLogs.length > 0) {
      compileLogsRef.current.scrollTop = compileLogsRef.current.scrollHeight
    }
  }, [compileLogs.length, compiling])

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
          <p className="text-gray-600 dark:text-gray-400">Aucun firmware disponible. Uploader un fichier .ino dans l&apos;onglet &quot;INO&quot; pour commencer.</p>
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

