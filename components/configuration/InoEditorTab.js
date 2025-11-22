'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Modal from '@/components/Modal'
import logger from '@/lib/logger'

export default function InoEditorTab() {
  const { fetchWithAuth, API_URL, token } = useAuth()
  const [selectedFile, setSelectedFile] = useState(null)
  const [inoContent, setInoContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isEdited, setIsEdited] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(null)
  const [uploadLogs, setUploadLogs] = useState([])
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [showVersionExistsModal, setShowVersionExistsModal] = useState(false)
  const [existingFirmware, setExistingFirmware] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [editingFirmwareId, setEditingFirmwareId] = useState(null)
  const [loadingIno, setLoadingIno] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [firmwareToDelete, setFirmwareToDelete] = useState(null)
  const [deletingFirmware, setDeletingFirmware] = useState(null)
  const [editorMinimized, setEditorMinimized] = useState(true)
  const fileInputRef = useRef(null)
  const uploadLogsRef = useRef(null)
  const textareaRef = useRef(null)

  const { data, loading, refetch, invalidateCache } = useApiData(
    ['/api.php/firmwares'],
    { requiresAuth: true, cacheTTL: 0 } // Désactiver le cache pour avoir les données en temps réel
  )

  const firmwares = data?.firmwares?.firmwares || []
  
  // Filtrer les firmwares pour ne garder que ceux avec des fichiers .ino (non compilés)
  // Utiliser useMemo pour optimiser le filtrage
  const inoFirmwares = useMemo(() => {
    return firmwares.filter(fw => {
      // Inclure les firmwares avec statut pending_compilation (fichiers .ino uploadés)
      if (fw.status === 'pending_compilation') return true
      // Inclure les firmwares dont le file_path se termine par .ino
      if (fw.file_path && fw.file_path.endsWith('.ino')) return true
      // Inclure les firmwares dont le file_path contient .ino (pour les cas où le chemin est relatif)
      if (fw.file_path && fw.file_path.includes('.ino')) return true
      return false
    }).sort((a, b) => {
      // Trier par date de création décroissante (les plus récents en premier)
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [firmwares])

  // Upload du fichier .ino
  const handleUpload = useCallback(async (file = null, content = null) => {
    const fileToUpload = file || selectedFile
    const contentToUpload = content !== null ? content : inoContent
    
    if (!fileToUpload && !contentToUpload) {
      setError('Veuillez sélectionner un fichier .ino ou entrer du contenu')
      return
    }

    logger.log('📤 Démarrage upload firmware:', fileToUpload?.name || 'contenu édité')
    setUploading(true)
    setCurrentStep('upload')
    setError(null)
    setSuccess(null)
    setUploadProgress(0)
    setUploadLogs([])

    // Ajouter un log initial
    setUploadLogs(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString('fr-FR'),
      message: '🚀 Démarrage de l\'upload...',
      level: 'info'
    }])

    try {
      const formData = new FormData()
      
      if (fileToUpload) {
        formData.append('firmware_ino', fileToUpload)
      } else if (contentToUpload) {
        // Créer un blob à partir du contenu édité
        const blob = new Blob([contentToUpload], { type: 'text/plain' })
        const filename = 'firmware_' + Date.now() + '.ino'
        formData.append('firmware_ino', blob, filename)
      }
      
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
          setUploadLogs(prev => {
            const newLogs = [...prev]
            if (newLogs.length === 0 || !newLogs[newLogs.length - 1].message.includes(`${percent}%`)) {
              newLogs.push({
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: `📤 Transfert... ${percent}%`,
                level: 'info'
              })
            } else {
              newLogs[newLogs.length - 1].message = `📤 Transfert... ${percent}%`
            }
            return newLogs
          })
          setTimeout(() => {
            if (uploadLogsRef.current) {
              uploadLogsRef.current.scrollTop = uploadLogsRef.current.scrollHeight
            }
          }, 100)
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          let response
          try {
            response = JSON.parse(xhr.responseText)
          } catch (parseErr) {
            setError('Réponse invalide du serveur')
            setUploadLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: '❌ Réponse invalide du serveur',
              level: 'error'
            }])
            setUploading(false)
            return
          }
          
          if (response.success) {
            setUploadProgress(100)
            setUploadLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: '✅ Upload réussi ! Firmware prêt pour compilation.',
              level: 'info'
            }])
            
            // Invalider le cache et rafraîchir la liste pour mettre à jour le tableau
            invalidateCache()
            setUploading(false)
            setSelectedFile(null)
            setInoContent('')
            setOriginalContent('')
            setIsEdited(false)
            // Réinitialiser le formulaire de fichier
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
            // Rafraîchir après un court délai pour laisser le temps au serveur
            setTimeout(() => {
              refetch().catch((err) => {
                logger.error('Erreur lors du rafraîchissement:', err)
              })
            }, 300)
          } else {
            if (response.error?.includes('existe déjà') || xhr.status === 409) {
              // Version existe déjà
              setExistingFirmware(response.existing_firmware || {
                version: response.version || 'inconnue',
                id: response.firmware_id
              })
              setPendingFile(fileToUpload)
              setShowVersionExistsModal(true)
              setUploading(false)
              setCurrentStep(null)
              setUploadProgress(0)
            } else {
              setError(response.error || 'Erreur lors de l\'upload')
              setUploadLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: `❌ Erreur: ${response.error || 'Erreur lors de l\'upload'}`,
                level: 'error'
              }])
              setUploading(false)
              setCurrentStep(null)
            }
          }
        } else {
          try {
            const error = JSON.parse(xhr.responseText)
            if (error.error?.includes('existe déjà') || xhr.status === 409) {
              setExistingFirmware(error.existing_firmware || {})
              setPendingFile(fileToUpload)
              setShowVersionExistsModal(true)
              setUploading(false)
              setCurrentStep(null)
              setUploadProgress(0)
            } else {
              setError(error.error || `Erreur HTTP ${xhr.status}`)
              setUploadLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: `❌ Erreur HTTP ${xhr.status}: ${error.error || xhr.statusText}`,
                level: 'error'
              }])
            }
          } catch {
            setError(`Erreur HTTP ${xhr.status}: ${xhr.statusText}`)
            setUploadLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `❌ Erreur HTTP ${xhr.status}: ${xhr.statusText}`,
              level: 'error'
            }])
          }
          setUploading(false)
          setCurrentStep(null)
        }
      })

      xhr.addEventListener('error', () => {
        setError('Erreur réseau lors de l\'upload.')
        setUploadLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: '❌ Erreur réseau lors de l\'upload',
          level: 'error'
        }])
        setUploading(false)
        setCurrentStep(null)
      })

      xhr.addEventListener('timeout', () => {
        setError('La requête a pris trop de temps (30s).')
        setUploadLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: '❌ La requête a pris trop de temps (30s)',
          level: 'error'
        }])
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
      setUploadLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        message: `❌ Exception: ${err.message || 'Erreur lors de l\'upload'}`,
        level: 'error'
      }])
      setUploading(false)
      setCurrentStep(null)
    }
  }, [selectedFile, inoContent, API_URL, token, refetch])

  // Extraire la version depuis le contenu .ino
  const extractVersionFromContent = (content) => {
    const match1 = content.match(/FIRMWARE_VERSION_STR\s+"([^"]+)"/)
    const match2 = content.match(/FIRMWARE_VERSION\s*=\s*"([^"]+)"/)
    return match1 ? match1[1] : (match2 ? match2[1] : null)
  }

  // Extraire la version depuis le fichier .ino
  const extractVersionFromIno = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target.result
        const version = extractVersionFromContent(content)
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
        throw new Error(errorData.error || 'Endpoint de vérification non disponible')
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
      // Lire le contenu du fichier
      const reader = new FileReader()
      reader.onload = async (e) => {
        const content = e.target.result
        setInoContent(content)
        setOriginalContent(content)
        setIsEdited(false)
        // Ne pas ouvrir l'éditeur automatiquement, seulement via le crayon

        const version = extractVersionFromContent(content)
        if (!version) {
          setError('Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.')
          setSelectedFile(null)
          setInoContent('')
          setOriginalContent('')
          return
        }

        // Vérifier si la version existe déjà
        let existingFirmware = null
        try {
          existingFirmware = await checkVersionExists(version)
          
          if (existingFirmware) {
            // Version existe déjà - afficher le modal
            setExistingFirmware(existingFirmware)
            setPendingFile(file)
            setShowVersionExistsModal(true)
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
            return
          }
        } catch (err) {
          // En cas d'erreur, on vérifie aussi dans la liste locale des firmwares
          logger.warn('Erreur lors de la vérification version via API:', err)
          
          // Fallback: vérifier dans la liste locale
          const localExisting = firmwares.find(fw => fw.version === version)
          if (localExisting) {
            setExistingFirmware(localExisting)
            setPendingFile(file)
            setShowVersionExistsModal(true)
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
            return
          }
          
          // Si l'endpoint n'est pas disponible, on continue quand même mais on informe
          if (err.message?.includes('404') || err.message?.includes('Endpoint not found')) {
            logger.warn('Endpoint de vérification non disponible, continuation de l\'upload')
            setError('⚠️ L\'endpoint de vérification n\'est pas disponible. L\'upload continue sans vérification.')
          } else {
            setError(`⚠️ Erreur lors de la vérification: ${err.message}. L'upload continue.`)
          }
        }
      }
      reader.onerror = () => {
        setError('Erreur lors de la lecture du fichier')
        setSelectedFile(null)
      }
      reader.readAsText(file)
    } catch (err) {
      logger.error('Erreur lors de la lecture du fichier:', err)
      setError('Erreur lors de la lecture du fichier')
      setSelectedFile(null)
    }
  }, [fetchWithAuth, API_URL, firmwares])

  // Gérer les modifications du contenu
  const handleContentChange = useCallback((e) => {
    const newContent = e.target.value
    setInoContent(newContent)
    setIsEdited(newContent !== originalContent)
  }, [originalContent])

  // Enregistrer le fichier
  const handleSave = useCallback(async () => {
    if (!inoContent.trim()) {
      setError('Le contenu est vide')
      return
    }

    const version = extractVersionFromContent(inoContent)
    if (!version) {
      setError('Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.')
      return
    }

    // Si on édite un fichier existant, mettre à jour via l'API (même si non modifié)
    if (editingFirmwareId) {
      const hasChanges = inoContent !== originalContent
      setUploading(true)
      setCurrentStep('upload')
      setError(null)
      setSuccess(null)
      setUploadProgress(0)
      setUploadLogs([{
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        message: hasChanges ? '🚀 Mise à jour du fichier .ino...' : '🚀 Upload du fichier .ino...',
        level: 'info'
      }])

      try {
        const response = await fetchWithAuth(
          `${API_URL}/api.php/firmwares/${editingFirmwareId}/ino`,
          {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ content: inoContent })
          },
          { requiresAuth: true }
        )

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
        }

        const data = await response.json()
        if (!data.success) {
          throw new Error(data.error || 'Erreur lors de la mise à jour')
        }

        setUploadProgress(100)
        setUploadLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: hasChanges ? '✅ Fichier .ino mis à jour avec succès !' : '✅ Fichier .ino uploadé avec succès !',
          level: 'info'
        }])

        // Invalider le cache et rafraîchir la liste pour mettre à jour le tableau
        invalidateCache()
        setUploading(false)
        setOriginalContent(inoContent)
        setIsEdited(false)
        setEditingFirmwareId(null)
        // Rafraîchir après un court délai pour laisser le temps au serveur
        setTimeout(() => {
          refetch().catch((err) => {
            logger.error('Erreur lors du rafraîchissement:', err)
          })
        }, 300)
      } catch (err) {
        logger.error('❌ Erreur lors de la mise à jour:', err)
        setError(err.message || 'Erreur lors de la mise à jour')
        setUploadLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: `❌ Erreur: ${err.message || 'Erreur lors de la mise à jour'}`,
          level: 'error'
        }])
        setUploading(false)
        setCurrentStep(null)
      }
    } else {
      // Nouveau fichier, lancer l'upload
      handleUpload(null, inoContent)
    }
  }, [inoContent, editingFirmwareId, handleUpload, API_URL, fetchWithAuth, refetch])

  // Réinitialiser les modifications
  const handleReset = useCallback(() => {
    setInoContent(originalContent)
    setIsEdited(false)
    setError(null)
  }, [originalContent])

  // Charger un fichier .ino existant pour l'éditer
  const handleLoadIno = useCallback(async (firmwareId) => {
    setLoadingIno(true)
    setError(null)
    setSuccess(null)
    setEditingFirmwareId(firmwareId)

    try {
      const response = await fetchWithAuth(
        `${API_URL}/api.php/firmwares/${firmwareId}/ino`,
        { method: 'GET' },
        { requiresAuth: true }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
      }

      const data = await response.json()
      if (!data.success) {
        throw new Error(data.error || 'Erreur lors du chargement')
      }

      setInoContent(data.content)
      setOriginalContent(data.content)
      setIsEdited(false)
      setEditorMinimized(false) // S'assurer que l'éditeur est ouvert

      // Scroll vers l'éditeur et focus après un court délai pour que le DOM soit mis à jour
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
          // Focus sur le textarea pour faciliter l'édition
          textareaRef.current.focus()
        }
      }, 100)
    } catch (err) {
      logger.error('Erreur lors du chargement du fichier .ino:', err)
      setError(err.message || 'Erreur lors du chargement du fichier .ino')
      setEditingFirmwareId(null)
    } finally {
      setLoadingIno(false)
    }
  }, [API_URL, fetchWithAuth])

  // Supprimer un fichier .ino
  const handleDeleteIno = useCallback(async () => {
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

      setShowDeleteConfirmModal(false)
      setFirmwareToDelete(null)
      
      // Si le fichier supprimé était en cours d'édition, réinitialiser
      if (editingFirmwareId === firmwareToDelete.id) {
        setInoContent('')
        setOriginalContent('')
        setIsEdited(false)
        setEditingFirmwareId(null)
      }
      
      // Invalider le cache et rafraîchir la liste pour mettre à jour le tableau
      invalidateCache()
      setTimeout(() => {
        refetch().catch((err) => {
          logger.error('Erreur lors du rafraîchissement après suppression:', err)
        })
      }, 300)
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
  }, [firmwareToDelete, editingFirmwareId, API_URL, fetchWithAuth, refetch])

  // Auto-scroll des logs
  useEffect(() => {
    if (uploadLogsRef.current && uploading) {
      uploadLogsRef.current.scrollTop = uploadLogsRef.current.scrollHeight
    }
  }, [uploadLogs, uploading])

  return (
    <div className="space-y-6">
      {/* Bouton de chargement seul en haut */}
      <div className="card">
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            📤 Charger un nouveau fichier .ino
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".ino"
            onChange={handleFileSelect}
            disabled={uploading}
            className="block w-full text-sm text-gray-500 dark:text-gray-400
              file:mr-4 file:py-2 file:px-4
              file:rounded-lg file:border-0
              file:text-sm file:font-semibold
              file:bg-primary-500 file:text-white
              hover:file:bg-primary-600
              disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Section Upload avec logs persistants */}
      {(uploading || currentStep === 'upload' || uploadLogs.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">
              {uploading ? '📤 Upload en cours' : uploadProgress === 100 ? '✅ Upload terminé' : '📤 Upload'}
            </h2>
            <div className="flex items-center gap-2">
              {uploadProgress > 0 && (
                <span className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                  {uploadProgress}%
                </span>
              )}
              {!uploading && uploadLogs.length > 0 && (
                <button
                  onClick={() => {
                    setUploadLogs([])
                    setCurrentStep(null)
                    setUploadProgress(0)
                    setError(null)
                  }}
                  className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  title="Fermer la fenêtre d'upload"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          
          {/* Barre de progression */}
          {(uploading || uploadProgress > 0) && (
            <div className="space-y-2 mb-4">
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${
                    uploading ? 'bg-primary-500' :
                    uploadProgress === 100 ? 'bg-green-500' :
                    'bg-gray-300 dark:bg-gray-600'
                  }`}
                  style={{ 
                    width: `${Math.max(0, Math.min(100, uploadProgress))}%` 
                  }}
                />
              </div>
            </div>
          )}

          {/* Logs d'upload */}
          <div
            ref={uploadLogsRef}
            className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm h-64 overflow-y-auto"
          >
            {uploadLogs.length === 0 ? (
              <div className="text-gray-500">En attente des logs...</div>
            ) : (
              uploadLogs.map((log, idx) => (
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

      {/* Liste des fichiers .ino existants */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">📦 Fichiers INO existants</h2>
        
        {loading ? (
          <LoadingSpinner />
        ) : inoFirmwares.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">Aucun fichier .ino disponible</p>
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
                {inoFirmwares.map((fw) => (
                  <tr 
                    key={fw.id} 
                    className="table-row"
                  >
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-primary">v{fw.version}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 dark:text-gray-400">
                      {fw.file_size ? `${(fw.file_size / 1024).toFixed(2)} KB` : '-'}
                    </td>
                    <td className="py-3 px-4">
                      {fw.status && (
                        <span className={`badge ${
                          fw.status === 'pending_compilation' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 
                          fw.status === 'compiling' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' :
                          fw.status === 'compiled' ? 'badge-success' :
                          fw.status === 'error' ? 'badge-danger' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        } text-xs`}>
                          {fw.status === 'pending_compilation' ? '✅ Uploadé' : 
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
                        <button
                          onClick={() => {
                            // Si le fichier est déjà chargé, fermer l'éditeur
                            if (editingFirmwareId === fw.id && inoContent.trim() !== '') {
                              setInoContent('')
                              setOriginalContent('')
                              setIsEdited(false)
                              setEditingFirmwareId(null)
                              setError(null)
                              setSuccess(null)
                              setEditorMinimized(true)
                            } else {
                              // Sinon, charger le fichier
                              handleLoadIno(fw.id)
                            }
                          }}
                          disabled={loadingIno}
                          className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50"
                          title={editingFirmwareId === fw.id && inoContent.trim() !== '' ? "Fermer l'éditeur" : "Éditer le fichier .ino"}
                        >
                          <span className="text-lg">✏️</span>
                        </button>
                        <button
                          onClick={() => {
                            setFirmwareToDelete(fw)
                            setShowDeleteConfirmModal(true)
                          }}
                          disabled={deletingFirmware === fw.id}
                          className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50"
                          title="Supprimer le fichier .ino"
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

      {/* Éditeur INO - affiché seulement après clic sur le crayon */}
      {editingFirmwareId && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">📝 Éditeur INO</h2>
            <button
              onClick={() => setEditorMinimized(!editorMinimized)}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              title={editorMinimized ? 'Afficher l\'éditeur' : 'Masquer l\'éditeur'}
            >
              {editorMinimized ? '⬆️' : '⬇️'}
            </button>
          </div>
          
          {!editorMinimized && (
          <div className="space-y-4">
            {/* Éditeur de texte */}
            {inoContent ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    {editingFirmwareId ? `Fichier .ino - Version v${inoFirmwares.find(f => f.id === editingFirmwareId)?.version || ''}` : 'Contenu du fichier .ino'}
                  </label>
                  <div className="flex gap-2">
                    {isEdited && (
                      <button
                        onClick={handleReset}
                        className="btn-secondary text-sm"
                        disabled={uploading}
                      >
                        ↺ Réinitialiser
                      </button>
                    )}
                    {/* Afficher le bouton seulement si c'est un nouveau fichier ou si le contenu a été modifié */}
                    {(!editingFirmwareId || isEdited) && (
                      <button
                        onClick={handleSave}
                        disabled={uploading}
                        className={`btn-primary text-sm ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {isEdited ? '💾 Enregistrer et Uploader' : '📤 Uploader'}
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  ref={textareaRef}
                  value={inoContent}
                  onChange={handleContentChange}
                  disabled={uploading}
                  className="w-full h-96 font-mono text-sm p-4 border border-gray-300 dark:border-gray-600 
                    rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100
                    disabled:opacity-50 disabled:cursor-not-allowed resize-y"
                  placeholder="Le contenu du fichier .ino apparaîtra ici..."
                />
                {isEdited && (
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">
                    ⚠️ Le fichier a été modifié. N'oubliez pas d'enregistrer !
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p className="mb-2">Aucun fichier chargé</p>
                <p className="text-sm">Sélectionnez un fichier .ino ci-dessus ou cliquez sur un fichier existant pour l'éditer</p>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* Messages d'erreur */}
      {error && <ErrorMessage error={error} />}

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
              Êtes-vous sûr de vouloir supprimer le fichier .ino <strong>v{firmwareToDelete.version}</strong> ?
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
                onClick={handleDeleteIno}
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
            <p className="text-gray-700 dark:text-gray-300">
              La version <strong>v{existingFirmware?.version}</strong> existe déjà.
            </p>
            
            {existingFirmware && (
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2"><strong>Firmware existant :</strong></p>
                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                  <li>Version : <strong>v{existingFirmware.version}</strong></li>
                  <li>Date : {existingFirmware.created_at ? new Date(existingFirmware.created_at).toLocaleString('fr-FR') : 'Inconnue'}</li>
                </ul>
              </div>
            )}
            
            <p className="text-gray-700 dark:text-gray-300">
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
                  
                  try {
                    await fetchJson(
                      fetchWithAuth,
                      API_URL,
                      `/api.php/firmwares/${existingFirmware.id}`,
                      { method: 'DELETE' },
                      { requiresAuth: true }
                    )
                    
                    setShowVersionExistsModal(false)
                    const fileToUpload = pendingFile
                    setExistingFirmware(null)
                    setPendingFile(null)
                    
                    if (fileToUpload) {
                      setTimeout(() => {
                        handleUpload(fileToUpload)
                      }, 500)
                    } else if (inoContent) {
                      setTimeout(() => {
                        handleUpload(null, inoContent)
                      }, 500)
                    }
                  } catch (err) {
                    setError('Erreur lors de la suppression : ' + err.message)
                  }
                }}
                className="btn-danger"
              >
                Supprimer et remplacer
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

