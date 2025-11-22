'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import logger from '@/lib/logger'

export default function FirmwareUploadPage() {
  const { fetchWithAuth, API_URL, user, token } = useAuth()
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [compiling, setCompiling] = useState(false)
  const [compileLogs, setCompileLogs] = useState([])
  const [compileProgress, setCompileProgress] = useState(0)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [uploadedFirmware, setUploadedFirmware] = useState(null)
  const fileInputRef = useRef(null)
  const compileLogsRef = useRef(null)
  const eventSourceRef = useRef(null)

  // Charger la liste des firmwares
  const { data, loading, error: dataError, refetch } = useApiData(
    ['/api.php/firmwares'],
    { requiresAuth: true }
  )

  const firmwares = data?.firmwares?.firmwares || []

  // Vérifier les permissions (admin ou technicien)
  const canUpload = user?.role_name === 'admin' || user?.role_name === 'technicien'

  // Compiler le firmware avec logs en direct (déclaré EN PREMIER car utilisé par handleUpload)
  const handleCompile = useCallback(async (uploadId) => {
    if (!uploadId) return

    setCompiling(true)
    setCompileLogs([])
    setCompileProgress(0)
    setError(null)
    setSuccess(null)

    try {
      // Démarrer la compilation et recevoir les logs en streaming
      if (!token) {
        throw new Error('Token manquant. Veuillez vous reconnecter.')
      }

      // Utiliser EventSource pour recevoir les logs en temps réel
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
            // Auto-scroll vers le bas
            setTimeout(() => {
              if (compileLogsRef.current) {
                compileLogsRef.current.scrollTop = compileLogsRef.current.scrollHeight
              }
            }, 100)
          } else if (data.type === 'progress') {
            setCompileProgress(data.progress || 0)
          } else if (data.type === 'success') {
            setSuccess(`✅ Compilation réussie ! Firmware v${data.version} disponible`)
            setCompiling(false)
            setCompileProgress(0) // Réinitialiser la barre de progression
            if (eventSourceRef.current) {
              eventSourceRef.current.close()
              eventSourceRef.current = null
            }
            refetch() // Recharger la liste des firmwares
          } else if (data.type === 'error') {
            setError(data.message || 'Erreur lors de la compilation')
            setCompiling(false)
            setCompileProgress(0) // Réinitialiser la barre de progression
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
        setError('Erreur de connexion lors de la compilation. Vérifiez votre connexion et que le serveur est accessible.')
        setCompiling(false)
        setCompileProgress(0) // Réinitialiser la barre de progression
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
      }

    } catch (err) {
      logger.error('Erreur lors du démarrage de la compilation:', err)
      setError(err.message || 'Erreur lors du démarrage de la compilation')
      setCompiling(false)
      setCompileProgress(0) // Réinitialiser la barre de progression
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [API_URL, refetch, token])

  // Upload du fichier .ino (déclaré APRÈS handleCompile car l'utilise)
  const handleUpload = useCallback(async (file = null) => {
    const fileToUpload = file || selectedFile
    if (!fileToUpload) {
      setError('Veuillez sélectionner un fichier .ino')
      logger.warn('Upload annulé: aucun fichier sélectionné')
      return
    }

    if (!canUpload) {
      setError('Accès refusé. Admin ou technicien requis.')
      logger.warn('Upload annulé: permissions insuffisantes')
      return
    }

    logger.log('📤 Démarrage upload firmware:', fileToUpload.name, `(${(fileToUpload.size / 1024).toFixed(2)} KB)`)
    setUploading(true)
    setError(null)
    setSuccess(null)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('firmware_ino', fileToUpload)
      formData.append('type', 'ino')

      if (!token) {
        throw new Error('Token manquant. Veuillez vous reconnecter.')
      }

      logger.log('🔗 Connexion à l\'API:', `${API_URL}/api.php/firmwares/upload-ino`)
      const xhr = new XMLHttpRequest()
      
      // Configurer le timeout (30 secondes - suffisant pour un fichier .ino de quelques KB)
      xhr.timeout = 30 * 1000 // 30 secondes

      // Suivre la progression de l'upload
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(percent)
          logger.debug('📊 Progression upload:', percent + '%')
        }
      })

      // Gérer la réponse
      xhr.addEventListener('loadstart', () => {
        logger.log('🚀 Upload démarré')
      })
      
      xhr.addEventListener('load', () => {
        logger.log('📥 Réponse reçue:', xhr.status, xhr.statusText, 'ReadyState:', xhr.readyState)
        if (xhr.status === 200) {
          const responseText = xhr.responseText
          logger.log('📥 Réponse brute:', responseText.substring(0, 200))
          
          let response
          try {
            response = JSON.parse(responseText)
          } catch (parseErr) {
            logger.error('❌ Erreur parsing JSON:', parseErr, 'Réponse:', responseText.substring(0, 200))
            setError('Réponse invalide du serveur: ' + responseText.substring(0, 100))
            setUploading(false)
            return
          }
          
          logger.log('✅ Réponse API parsée:', response)
          
          if (response.success) {
            setSuccess('✅ Fichier .ino uploadé avec succès')
            setUploadedFirmware(response)
            
            // Réinitialiser la barre de progression après un court délai
            setTimeout(() => {
              setUploadProgress(0)
            }, 1000)
            
            // Vérifier que l'ID est présent
            const firmwareId = response.upload_id || response.firmware_id
            if (!firmwareId) {
              logger.error('❌ Aucun ID de firmware dans la réponse:', response)
              setError('Réponse invalide: ID de firmware manquant')
              setUploading(false)
              return
            }
            
            logger.log('🚀 Démarrage compilation automatique dans 500ms pour ID:', firmwareId)
            
            // Démarrer automatiquement la compilation
            setTimeout(() => {
              logger.log('🔨 Démarrage compilation pour firmware ID:', firmwareId)
              handleCompile(firmwareId)
            }, 500)
          } else {
            const errorMsg = response.error || 'Erreur lors de l\'upload'
            setError(errorMsg)
            logger.error('❌ Erreur upload:', errorMsg)
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            const errorMsg = error.error || `Erreur HTTP ${xhr.status}`
            setError(errorMsg)
            logger.error('❌ Erreur HTTP:', xhr.status, errorMsg)
          } catch {
            const errorMsg = `Erreur HTTP ${xhr.status}: ${xhr.statusText}`
            setError(errorMsg)
            logger.error('❌ Erreur HTTP:', xhr.status, xhr.statusText)
          }
        }
        setUploading(false)
        // Réinitialiser la barre de progression après un court délai en cas d'erreur
        if (xhr.status !== 200) {
          setTimeout(() => {
            setUploadProgress(0)
          }, 1000)
        }
      })

      xhr.addEventListener('error', (e) => {
        logger.error('❌ Erreur réseau XHR:', e)
        logger.error('❌ XHR State:', xhr.readyState, 'Status:', xhr.status)
        logger.error('❌ Response:', xhr.responseText?.substring(0, 200))
        logger.error('❌ Event details:', {
          type: e.type,
          target: e.target,
          currentTarget: e.currentTarget
        })
        setError('Erreur réseau lors de l\'upload. Vérifiez votre connexion et que le serveur est accessible.')
        setUploading(false)
        setTimeout(() => {
          setUploadProgress(0)
        }, 1000)
      })
      
      xhr.addEventListener('loadend', () => {
        logger.log('🏁 Upload terminé (loadend)')
      })
      
      xhr.addEventListener('abort', () => {
        logger.warn('⚠️ Upload annulé (abort)')
        setUploading(false)
      })

      xhr.addEventListener('timeout', () => {
        logger.error('⏱️ Timeout: La requête a pris trop de temps (30s)')
        logger.error('⏱️ XHR State au timeout:', xhr.readyState, 'Status:', xhr.status)
        logger.error('⏱️ Response partielle:', xhr.responseText?.substring(0, 200))
        setError('La requête a pris trop de temps (30s). Vérifiez votre connexion ou la taille du fichier.')
        setUploading(false)
        xhr.abort()
        setTimeout(() => {
          setUploadProgress(0)
        }, 1000)
      })

      xhr.addEventListener('abort', () => {
        if (xhr.status === 0 && !xhr.timeout) {
          logger.warn('⚠️ Upload annulé')
          setError('Upload annulé')
        }
        setUploading(false)
        setTimeout(() => {
          setUploadProgress(0)
        }, 1000)
      })

      const uploadUrl = `${API_URL}/api.php/firmwares/upload-ino`
      logger.log('📤 Envoi requête POST vers:', uploadUrl)
      logger.log('📦 Taille du fichier:', fileToUpload.size, 'bytes')
      
      xhr.open('POST', uploadUrl)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      
      // Ne pas définir Content-Type pour FormData (le navigateur le fait automatiquement)
      xhr.send(formData)
      logger.log('📤 Requête envoyée, attente réponse... (timeout: 30s)')

    } catch (err) {
      logger.error('❌ Exception lors de l\'upload:', err)
      setError(err.message || 'Erreur lors de l\'upload')
      setUploading(false)
      setTimeout(() => {
        setUploadProgress(0)
      }, 1000)
    }
  }, [selectedFile, canUpload, API_URL, handleCompile, token])

  // Gérer la sélection de fichier et démarrer automatiquement l'upload
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.name.endsWith('.ino')) {
      setSelectedFile(file)
      setError(null)
      setSuccess(null)
      // Démarrer automatiquement l'upload après sélection
      setTimeout(() => {
        handleUpload(file)
      }, 100)
    } else {
      setError('Seuls les fichiers .ino sont acceptés')
      setSelectedFile(null)
    }
  }, [handleUpload])



  // Nettoyer EventSource au démontage
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  if (!canUpload) {
    return (
      <div className="p-6">
        <ErrorMessage message="Accès refusé. Seuls les administrateurs et techniciens peuvent uploader des firmwares." />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">📦 Upload & Compilation Firmware</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Upload un fichier .ino, compilez-le en direct et rendez-le disponible pour le flash OTA/USB
          </p>
        </div>
      </div>

      {/* Section Upload */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">📤 Upload du fichier .ino</h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Sélectionner un fichier .ino
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".ino"
              onChange={handleFileSelect}
              disabled={uploading || compiling}
              className="block w-full text-sm text-gray-500 dark:text-gray-400
                file:mr-4 file:py-2 file:px-4
                file:rounded-lg file:border-0
                file:text-sm file:font-semibold
                file:bg-primary-500 file:text-white
                hover:file:bg-primary-600
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                Fichier sélectionné : <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(2)} KB)
              </p>
            )}
          </div>

          {/* Barre de progression Upload - toujours visible */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {uploading ? '⏳ Transfert en cours...' : uploadProgress > 0 ? '✅ Transfert terminé' : 'En attente...'}
              </span>
              <span className="font-semibold">{uploadProgress > 0 ? `${uploadProgress}%` : '0%'}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  uploading ? 'bg-primary-500' : uploadProgress === 100 ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
              />
            </div>
          </div>

          {/* Barre de progression Compilation - toujours visible en dessous */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {compiling ? '🔨 Compilation en cours...' : compileProgress > 0 ? '✅ Compilation terminée' : 'En attente...'}
              </span>
              <span className="font-semibold">{compileProgress > 0 ? `${compileProgress}%` : '0%'}</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-300 ${
                  compiling ? 'bg-blue-500' : compileProgress === 100 ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                }`}
                style={{ width: `${Math.max(0, Math.min(100, compileProgress))}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Section Compilation avec logs en direct */}
      {compiling && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">🔨 Compilation en cours...</h2>
          
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Logs de compilation en direct :</h3>
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
          </div>
        </div>
      )}

      {/* Messages d'erreur et succès */}
      {error && <ErrorMessage message={error} />}
      {success && <SuccessMessage message={success} />}

      {/* Liste des firmwares disponibles */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">📋 Firmwares disponibles</h2>
        
        {loading ? (
          <LoadingSpinner />
        ) : firmwares.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">Aucun firmware disponible</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Taille
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Statut
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {firmwares.map((fw) => (
                  <tr key={fw.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono font-semibold">v{fw.version}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {(fw.file_size / 1024).toFixed(2)} KB
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fw.is_stable ? (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          ✅ Stable
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                          ⚠️ Beta
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600 dark:text-gray-400">
                      {new Date(fw.created_at).toLocaleDateString('fr-FR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

