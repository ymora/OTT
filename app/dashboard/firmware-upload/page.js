'use client'

import { useState, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import logger from '@/lib/logger'

export default function FirmwareUploadPage() {
  const { fetchWithAuth, API_URL, user } = useAuth()
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

  // Gérer la sélection de fichier
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.name.endsWith('.ino')) {
      setSelectedFile(file)
      setError(null)
      setSuccess(null)
    } else {
      setError('Seuls les fichiers .ino sont acceptés')
      setSelectedFile(null)
    }
  }, [])

  // Upload du fichier .ino
  const handleUpload = useCallback(async () => {
    if (!selectedFile) {
      setError('Veuillez sélectionner un fichier .ino')
      logger.warn('Upload annulé: aucun fichier sélectionné')
      return
    }

    if (!canUpload) {
      setError('Accès refusé. Admin ou technicien requis.')
      logger.warn('Upload annulé: permissions insuffisantes')
      return
    }

    logger.log('📤 Démarrage upload firmware:', selectedFile.name, `(${(selectedFile.size / 1024).toFixed(2)} KB)`)
    setUploading(true)
    setError(null)
    setSuccess(null)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      formData.append('firmware_ino', selectedFile)
      formData.append('type', 'ino')

      const token = localStorage.getItem('token')
      if (!token) {
        throw new Error('Token manquant. Veuillez vous reconnecter.')
      }

      logger.log('🔗 Connexion à l\'API:', `${API_URL}/api.php/firmwares/upload-ino`)
      const xhr = new XMLHttpRequest()

      // Suivre la progression de l'upload
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(percent)
          logger.debug('📊 Progression upload:', percent + '%')
        }
      })

      // Gérer la réponse
      xhr.addEventListener('load', () => {
        logger.log('📥 Réponse reçue:', xhr.status, xhr.statusText)
        if (xhr.status === 200) {
          try {
            const response = JSON.parse(xhr.responseText)
            logger.log('✅ Réponse API:', response)
            if (response.success) {
              setSuccess('✅ Fichier .ino uploadé avec succès')
              setUploadedFirmware(response)
              setUploadProgress(100)
              logger.log('🚀 Démarrage compilation automatique dans 500ms...')
              // Démarrer automatiquement la compilation
              setTimeout(() => {
                const firmwareId = response.upload_id || response.firmware_id
                logger.log('🔨 Démarrage compilation pour firmware ID:', firmwareId)
                handleCompile(firmwareId)
              }, 500)
            } else {
              const errorMsg = response.error || 'Erreur lors de l\'upload'
              setError(errorMsg)
              logger.error('❌ Erreur upload:', errorMsg)
            }
          } catch (err) {
            const errorMsg = 'Erreur lors du parsing de la réponse: ' + err.message
            setError(errorMsg)
            logger.error('❌ Erreur parsing réponse:', err)
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
      })

      xhr.addEventListener('error', (e) => {
        logger.error('❌ Erreur réseau XHR:', e)
        setError('Erreur réseau lors de l\'upload. Vérifiez votre connexion.')
        setUploading(false)
        setUploadProgress(0)
      })

      xhr.addEventListener('abort', () => {
        logger.warn('⚠️ Upload annulé par l\'utilisateur')
        setError('Upload annulé')
        setUploading(false)
        setUploadProgress(0)
      })

      const uploadUrl = `${API_URL}/api.php/firmwares/upload-ino`
      logger.log('📤 Envoi requête POST vers:', uploadUrl)
      xhr.open('POST', uploadUrl)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      
      // Ne pas définir Content-Type pour FormData (le navigateur le fait automatiquement)
      xhr.send(formData)
      logger.log('📤 Requête envoyée, attente réponse...')

    } catch (err) {
      logger.error('❌ Exception lors de l\'upload:', err)
      setError(err.message || 'Erreur lors de l\'upload')
      setUploading(false)
      setUploadProgress(0)
    }
  }, [selectedFile, canUpload, API_URL, handleCompile])

  // Compiler le firmware avec logs en direct
  const handleCompile = useCallback(async (uploadId) => {
    if (!uploadId) return

    setCompiling(true)
    setCompileLogs([])
    setCompileProgress(0)
    setError(null)
    setSuccess(null)

    try {
      // Démarrer la compilation et recevoir les logs en streaming
      const token = localStorage.getItem('token')
      if (!token) throw new Error('Token manquant')

      // Utiliser EventSource pour recevoir les logs en temps réel
      const eventSource = new EventSource(
        `${API_URL}/api.php/firmwares/compile/${uploadId}?token=${encodeURIComponent(token)}`
      )

      eventSourceRef.current = eventSource

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
            eventSource.close()
            refetch() // Recharger la liste des firmwares
          } else if (data.type === 'error') {
            setError(data.message || 'Erreur lors de la compilation')
            setCompiling(false)
            eventSource.close()
          }
        } catch (err) {
          logger.error('Erreur parsing EventSource:', err)
        }
      }

      eventSource.onerror = (err) => {
        logger.error('EventSource error:', err)
        setError('Erreur de connexion lors de la compilation')
        setCompiling(false)
        eventSource.close()
      }

    } catch (err) {
      setError(err.message || 'Erreur lors du démarrage de la compilation')
      setCompiling(false)
    }
  }, [API_URL, refetch])

  // Nettoyer EventSource au démontage
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
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

          {/* Barre de progression - toujours visible */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                {uploading ? '⏳ Transfert en cours...' : uploadProgress > 0 ? '✅ Transfert terminé' : 'En attente...'}
              </span>
              <span className="font-semibold">{uploadProgress}%</span>
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

          <button
            onClick={handleUpload}
            disabled={!selectedFile || uploading || compiling}
            className="btn-primary w-full"
          >
            {uploading ? '⏳ Upload en cours...' : '📤 Uploader le fichier .ino'}
          </button>
        </div>
      </div>

      {/* Section Compilation avec logs en direct */}
      {compiling && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">🔨 Compilation en cours...</h2>
          
          {compileProgress > 0 && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">Progression</span>
                <span className="font-semibold">{compileProgress}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${compileProgress}%` }}
                />
              </div>
            </div>
          )}

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

