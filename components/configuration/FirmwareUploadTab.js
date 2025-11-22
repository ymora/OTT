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

export default function FirmwareUploadTab() {
  const { fetchWithAuth, API_URL, token } = useAuth()
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [compiling, setCompiling] = useState(false)
  const [compileLogs, setCompileLogs] = useState([])
  const [compileProgress, setCompileProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(null)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showVersionExistsModal, setShowVersionExistsModal] = useState(false)
  const [existingFirmware, setExistingFirmware] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [deletingFirmware, setDeletingFirmware] = useState(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [firmwareToDelete, setFirmwareToDelete] = useState(null)
  const fileInputRef = useRef(null)
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
            setCompiling(false)
            setCurrentStep(null)
            setCompileProgress(0)
            setUploadProgress(0)
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
            setUploadProgress(0)
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
        setError('Erreur de connexion lors de la compilation.')
        setCompiling(false)
        setCurrentStep(null)
        setCompileProgress(0)
        setUploadProgress(0)
        if (eventSourceRef.current) {
          eventSourceRef.current.close()
          eventSourceRef.current = null
        }
      }

    } catch (err) {
      logger.error('Erreur lors du démarrage de la compilation:', err)
      setError(err.message || 'Erreur lors du démarrage de la compilation')
      setCompiling(false)
      setCurrentStep(null)
      setCompileProgress(0)
      setUploadProgress(0)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [API_URL, refetch, token])

  // Upload du fichier .ino
  const handleUpload = useCallback(async (file = null) => {
    const fileToUpload = file || selectedFile
    if (!fileToUpload) {
      setError('Veuillez sélectionner un fichier .ino')
      return
    }

    logger.log('📤 Démarrage upload firmware:', fileToUpload.name)
    setUploading(true)
    setCurrentStep('upload')
    setError(null)
    setSuccess(null)
    setUploadProgress(0)
    setCompileProgress(0)

    try {
      const formData = new FormData()
      formData.append('firmware_ino', fileToUpload)
      formData.append('type', 'ino')

      if (!token) {
        throw new Error('Token manquant. Veuillez vous reconnecter.')
      }

      const xhr = new XMLHttpRequest()
      xhr.timeout = 30 * 1000

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(percent)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          let response
          try {
            response = JSON.parse(xhr.responseText)
          } catch (parseErr) {
            setError('Réponse invalide du serveur')
            setUploading(false)
            return
          }
          
          if (response.success) {
            const firmwareId = response.upload_id || response.firmware_id
            if (!firmwareId) {
              setError('Réponse invalide: ID de firmware manquant')
              setUploading(false)
              setCurrentStep(null)
              setUploadProgress(0)
              return
            }
            
            setUploadProgress(100)
            setUploading(false)
            
            setTimeout(() => {
              handleCompile(firmwareId)
            }, 500)
          } else {
            setError(response.error || 'Erreur lors de l\'upload')
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            setError(error.error || `Erreur HTTP ${xhr.status}`)
          } catch {
            setError(`Erreur HTTP ${xhr.status}: ${xhr.statusText}`)
          }
        }
        setUploading(false)
        setCurrentStep(null)
      })

      xhr.addEventListener('error', () => {
        setError('Erreur réseau lors de l\'upload.')
        setUploading(false)
        setCurrentStep(null)
      })

      xhr.addEventListener('timeout', () => {
        setError('La requête a pris trop de temps (30s).')
        setUploading(false)
        setCurrentStep(null)
        xhr.abort()
      })

      xhr.open('POST', `${API_URL}/api.php/firmwares/upload-ino`)
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
      xhr.send(formData)

    } catch (err) {
      logger.error('❌ Exception lors de l\'upload:', err)
      setError(err.message || 'Erreur lors de l\'upload')
      setUploading(false)
      setCurrentStep(null)
    }
  }, [selectedFile, API_URL, handleCompile, token])

  // Extraire la version depuis le fichier .ino
  const extractVersionFromIno = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target.result
        const match1 = content.match(/FIRMWARE_VERSION_STR\s+"([^"]+)"/)
        const match2 = content.match(/FIRMWARE_VERSION\s*=\s*"([^"]+)"/)
        const version = match1 ? match1[1] : (match2 ? match2[1] : null)
        resolve(version)
      }
      reader.onerror = reject
      reader.readAsText(file)
    })
  }

  // Vérifier si la version existe déjà
  const checkVersionExists = async (version) => {
    try {
      const response = await fetchWithAuth(
        `${API_URL}/api.php/firmwares/check-version/${encodeURIComponent(version)}`,
        { method: 'GET' },
        { requiresAuth: true }
      )
      
      if (response.status === 404) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || 'Endpoint de vérification non disponible'
        logger.error('Erreur 404 lors de la vérification version:', errorMessage)
        throw new Error(`Erreur système: ${errorMessage}`)
      }
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
      }
      
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Erreur API')
      }
      
      return data.exists ? data.firmware : null
    } catch (err) {
      logger.error('Erreur vérification version:', err)
      throw err
    }
  }

  // Gérer la sélection de fichier
  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.name.endsWith('.ino')) {
      setError('Seuls les fichiers .ino sont acceptés')
      setSelectedFile(null)
      return
    }

    setSelectedFile(file)
    setError(null)
    setSuccess(null)

    try {
      const version = await extractVersionFromIno(file)
      if (!version) {
        setError('Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.')
        setSelectedFile(null)
        return
      }

      let existingFirmware = null
      try {
        existingFirmware = await checkVersionExists(version)
      } catch (err) {
        if (err.message?.includes('404') || err.message?.includes('Endpoint not found')) {
          logger.warn('Endpoint de vérification non disponible, continuation de l\'upload')
          setError('⚠️ L\'endpoint de vérification n\'est pas disponible. L\'upload continue sans vérification.')
          existingFirmware = null
        } else {
          setError(`⚠️ Erreur lors de la vérification: ${err.message}. L'upload continue.`)
          existingFirmware = null
        }
      }
      
      if (existingFirmware) {
        setExistingFirmware(existingFirmware)
        setPendingFile(file)
        setShowVersionExistsModal(true)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        return
      }
      
      setTimeout(() => {
        handleUpload(file)
      }, 100)
    } catch (err) {
      logger.error('Erreur lors de la lecture du fichier:', err)
      setError('Erreur lors de la lecture du fichier')
      setSelectedFile(null)
    }
  }, [handleUpload, fetchWithAuth, API_URL])

  // Nettoyer EventSource au démontage
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [])

  return (
    <div className="space-y-6">
      {/* Section Upload */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">📤 Upload Firmware</h2>
        
        <div className="space-y-4">
          <div>
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
          </div>

          {/* Barre de progression */}
          {(uploading || compiling || currentStep) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {currentStep === 'upload' && uploading && `📤 Transfert... ${uploadProgress}%`}
                  {currentStep === 'upload' && !uploading && uploadProgress === 100 && '✅ Transfert terminé'}
                  {currentStep === 'compilation' && compiling && `🔨 Compilation... ${compileProgress}%`}
                  {currentStep === 'compilation' && !compiling && compileProgress === 100 && '✅ Compilation terminée'}
                </span>
                <span className="font-semibold">
                  {currentStep === 'upload' && `${uploadProgress}%`}
                  {currentStep === 'compilation' && `${compileProgress}%`}
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    currentStep === 'upload' && uploading ? 'bg-primary-500' :
                    currentStep === 'upload' && uploadProgress === 100 ? 'bg-green-500' :
                    currentStep === 'compilation' && compiling ? 'bg-blue-500' :
                    currentStep === 'compilation' && compileProgress === 100 ? 'bg-green-500' :
                    'bg-gray-300 dark:bg-gray-600'
                  }`}
                  style={{ 
                    width: `${Math.max(0, Math.min(100, currentStep === 'upload' ? uploadProgress : compileProgress))}%` 
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Section Compilation avec logs */}
      {compiling && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">🔨 Compilation</h2>
          
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
          <p className="text-gray-600 dark:text-gray-400">Aucun firmware disponible</p>
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
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-primary">v{fw.version}</span>
                        {fw.is_stable ? (
                          <span className="badge badge-success text-xs">Stable</span>
                        ) : (
                          <span className="badge bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs">Beta</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {(fw.file_size / 1024).toFixed(2)} KB
                    </td>
                    <td className="py-3 px-4">
                      {fw.status && (
                        <span className={`badge ${
                          fw.status === 'pending_compilation' ? 'bg-yellow-100 text-yellow-700' : 
                          fw.status === 'compiling' ? 'bg-blue-100 text-blue-700' :
                          fw.status === 'compiled' ? 'badge-success' :
                          fw.status === 'error' ? 'badge-danger' : 'bg-gray-100 text-gray-700'
                        } text-xs`}>
                          {fw.status === 'pending_compilation' ? 'En attente' : 
                           fw.status === 'compiling' ? 'Compilation' :
                           fw.status === 'compiled' ? 'Compilé' :
                           fw.status === 'error' ? 'Erreur' : fw.status}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {new Date(fw.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="py-3 px-4 text-center">
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

      {/* Modal version existe déjà */}
      {showVersionExistsModal && (
        <Modal
          isOpen={showVersionExistsModal}
          onClose={() => {
            setShowVersionExistsModal(false)
            setExistingFirmware(null)
            setPendingFile(null)
          }}
          title="Version de firmware déjà existante"
          maxWidth="max-w-lg"
        >
          <div className="space-y-4">
            <p className="text-gray-700">
              La version <strong>v{existingFirmware?.version}</strong> existe déjà.
            </p>
            
            {existingFirmware && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-600 mb-2"><strong>Firmware existant :</strong></p>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>Version : <strong>v{existingFirmware.version}</strong></li>
                  <li>Date : {new Date(existingFirmware.created_at).toLocaleString('fr-FR')}</li>
                </ul>
              </div>
            )}
            
            <p className="text-gray-700">
              Voulez-vous supprimer le firmware existant et le remplacer par le nouveau ?
            </p>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowVersionExistsModal(false)
                  setExistingFirmware(null)
                  setPendingFile(null)
                }}
                className="btn-secondary"
              >
                Annuler
              </button>
              <button
                onClick={async () => {
                  if (!existingFirmware) return
                  
                  setDeletingFirmware(existingFirmware.id)
                  try {
                    await fetchJson(
                      fetchWithAuth,
                      API_URL,
                      `/api.php/firmwares/${existingFirmware.id}`,
                      { method: 'DELETE' },
                      { requiresAuth: true }
                    )
                    
                    setShowVersionExistsModal(false)
                    setExistingFirmware(null)
                    
                    if (pendingFile) {
                      setTimeout(() => {
                        handleUpload(pendingFile)
                      }, 500)
                    }
                    setPendingFile(null)
                    setDeletingFirmware(null)
                  } catch (err) {
                    setError('Erreur lors de la suppression : ' + err.message)
                    setDeletingFirmware(null)
                  }
                }}
                disabled={deletingFirmware !== null}
                className="btn-danger"
              >
                {deletingFirmware ? 'Suppression...' : 'Supprimer et remplacer'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

