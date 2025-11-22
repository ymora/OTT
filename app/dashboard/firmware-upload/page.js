'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import SuccessMessage from '@/components/SuccessMessage'
import Modal from '@/components/Modal'
import FlashUSBModal from '@/components/FlashUSBModal'
import { useUsb } from '@/contexts/UsbContext'
import logger from '@/lib/logger'
import { formatTimeAgo } from '@/lib/utils'

export default function FirmwareUploadPage() {
  const { fetchWithAuth, API_URL, user, token } = useAuth()
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [compiling, setCompiling] = useState(false)
  const [compileLogs, setCompileLogs] = useState([])
  const [compileProgress, setCompileProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(null) // 'upload' | 'compilation' | null
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [uploadedFirmware, setUploadedFirmware] = useState(null)
  const [showVersionExistsModal, setShowVersionExistsModal] = useState(false)
  const [existingFirmware, setExistingFirmware] = useState(null)
  const [pendingFile, setPendingFile] = useState(null)
  const [deletingFirmware, setDeletingFirmware] = useState(null)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [firmwareToDelete, setFirmwareToDelete] = useState(null)
  const fileInputRef = useRef(null)
  const compileLogsRef = useRef(null)
  const eventSourceRef = useRef(null)

  // Charger la liste des firmwares et dispositifs
  const { data, loading, error: dataError, refetch } = useApiData(
    ['/api.php/firmwares', '/api.php/devices'],
    { requiresAuth: true }
  )

  const firmwares = data?.firmwares?.firmwares || []
  const devices = data?.devices?.devices || []

  // Contexte USB pour le flash USB
  const {
    usbConnectedDevice,
    usbVirtualDevice,
    isSupported,
    autoDetecting,
    setAutoDetecting
  } = useUsb()

  // Activer la détection automatique USB si aucun dispositif n'est connecté
  useUsbAutoDetection(isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice)

  // Vérifier les permissions (admin ou technicien)
  const canUpload = user?.role_name === 'admin' || user?.role_name === 'technicien'
  const canFlash = canUpload // Même permission pour flasher

  // États pour le déploiement
  const [selectedFirmwareVersion, setSelectedFirmwareVersion] = useState('')
  const [selectedFirmwareForFlash, setSelectedFirmwareForFlash] = useState(null)
  const [otaDeploying, setOtaDeploying] = useState({})
  const [flashMessage, setFlashMessage] = useState(null)
  const [flashError, setFlashError] = useState(null)
  const [showFlashUSBModal, setShowFlashUSBModal] = useState(false)
  const [deviceForFlash, setDeviceForFlash] = useState(null)

  // Compiler le firmware avec logs en direct (déclaré EN PREMIER car utilisé par handleUpload)
  const handleCompile = useCallback(async (uploadId) => {
    if (!uploadId) return

    setCompiling(true)
    setCurrentStep('compilation')
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
            setCurrentStep(null)
            setCompileProgress(0)
            setUploadProgress(0)
            if (eventSourceRef.current) {
              eventSourceRef.current.close()
              eventSourceRef.current = null
            }
            refetch() // Recharger la liste des firmwares
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
        setError('Erreur de connexion lors de la compilation. Vérifiez votre connexion et que le serveur est accessible.')
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
            setUploadedFirmware(response)
            
            // Vérifier que l'ID est présent
            const firmwareId = response.upload_id || response.firmware_id
            if (!firmwareId) {
              logger.error('❌ Aucun ID de firmware dans la réponse:', response)
              setError('Réponse invalide: ID de firmware manquant')
              setUploading(false)
              setCurrentStep(null)
              setUploadProgress(0)
              return
            }
            
            // Upload terminé, passer à la compilation
            setUploadProgress(100)
            setUploading(false)
            
            logger.log('🚀 Démarrage compilation automatique dans 500ms pour ID:', firmwareId)
            
            // Démarrer automatiquement la compilation
            setTimeout(() => {
              logger.log('🔨 Démarrage compilation pour firmware ID:', firmwareId)
              handleCompile(firmwareId)
            }, 500)
          } else {
            // Vérifier si c'est une erreur de version existante (ne devrait pas arriver ici car géré dans le else)
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
        setCurrentStep(null)
        // Réinitialiser la barre de progression après un court délai en cas d'erreur
        if (xhr.status !== 200) {
          setTimeout(() => {
            setUploadProgress(0)
            setCompileProgress(0)
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
        setCurrentStep(null)
        setTimeout(() => {
          setUploadProgress(0)
          setCompileProgress(0)
        }, 1000)
      })
      
      xhr.addEventListener('loadend', () => {
        logger.log('🏁 Upload terminé (loadend)')
      })
      
      xhr.addEventListener('abort', () => {
        logger.warn('⚠️ Upload annulé (abort)')
        setUploading(false)
        setCurrentStep(null)
      })

      xhr.addEventListener('timeout', () => {
        logger.error('⏱️ Timeout: La requête a pris trop de temps (30s)')
        logger.error('⏱️ XHR State au timeout:', xhr.readyState, 'Status:', xhr.status)
        logger.error('⏱️ Response partielle:', xhr.responseText?.substring(0, 200))
        setError('La requête a pris trop de temps (30s). Vérifiez votre connexion ou la taille du fichier.')
        setUploading(false)
        setCurrentStep(null)
        xhr.abort()
        setTimeout(() => {
          setUploadProgress(0)
          setCompileProgress(0)
        }, 1000)
      })

      xhr.addEventListener('abort', () => {
        if (xhr.status === 0 && !xhr.timeout) {
          logger.warn('⚠️ Upload annulé')
          setError('Upload annulé')
        }
        setUploading(false)
        setCurrentStep(null)
        setTimeout(() => {
          setUploadProgress(0)
          setCompileProgress(0)
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
      setCurrentStep(null)
      setTimeout(() => {
        setUploadProgress(0)
        setCompileProgress(0)
      }, 1000)
    }
  }, [selectedFile, canUpload, API_URL, handleCompile, token])

  // Extraire la version depuis le fichier .ino
  const extractVersionFromIno = async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target.result
        // Chercher FIRMWARE_VERSION_STR ou FIRMWARE_VERSION
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
      
      // Si l'endpoint retourne 404, c'est un problème système (endpoint non trouvé)
      if (response.status === 404) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || 'Endpoint de vérification non disponible'
        logger.error('Erreur 404 lors de la vérification version:', errorMessage)
        throw new Error(`Erreur système: ${errorMessage}`)
      }
      
      // Vérifier le statut HTTP
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMessage = errorData.error || `Erreur HTTP ${response.status}`
        logger.error('Erreur lors de la vérification version:', errorMessage)
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      
      // Vérifier le succès de l'opération
      if (!data.success) {
        const errorMessage = data.error || 'Erreur API'
        logger.error('Erreur API lors de la vérification version:', errorMessage)
        throw new Error(errorMessage)
      }
      
      logger.log('Vérification version:', version, 'existe:', data.exists)
      return data.exists ? data.firmware : null
    } catch (err) {
      logger.error('Erreur vérification version:', err)
      // Relancer l'erreur pour que handleFileSelect puisse la gérer
      throw err
    }
  }

  // Gérer la sélection de fichier et vérifier la version AVANT upload
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
      // Extraire la version du fichier
      const version = await extractVersionFromIno(file)
      if (!version) {
        setError('Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.')
        setSelectedFile(null)
        return
      }

      // Vérifier si la version existe déjà
      let existingFirmware = null
      try {
        existingFirmware = await checkVersionExists(version)
      } catch (err) {
        // Si c'est une erreur 404 (endpoint non disponible), continuer quand même l'upload
        // mais afficher un avertissement
        if (err.message?.includes('404') || err.message?.includes('Endpoint not found')) {
          logger.warn('Endpoint de vérification non disponible, continuation de l\'upload sans vérification')
          setError('⚠️ L\'endpoint de vérification n\'est pas disponible. L\'upload continue sans vérification de version existante.')
          // Ne pas bloquer, continuer l'upload
          existingFirmware = null
        } else {
          // Pour les autres erreurs, afficher l'erreur mais permettre quand même l'upload
          logger.error('Erreur lors de la vérification de version:', err)
          setError(`⚠️ Erreur lors de la vérification: ${err.message}. L'upload continue.`)
          existingFirmware = null
        }
      }
      
      logger.log('Résultat vérification version:', { version, existingFirmware })
      if (existingFirmware) {
        logger.log('Version existe déjà, affichage du modal')
        setExistingFirmware(existingFirmware)
        setPendingFile(file)
        setShowVersionExistsModal(true)
        // Réinitialiser le fichier sélectionné pour permettre de le re-sélectionner
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        return
      }
      
      logger.log('Version n\'existe pas, démarrage upload')

      // Version n'existe pas, démarrer l'upload
      setTimeout(() => {
        handleUpload(file)
      }, 100)
    } catch (err) {
      logger.error('Erreur lors de la vérification:', err)
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

  if (!canUpload) {
    return (
      <div className="p-6">
        <ErrorMessage error="Accès refusé. Seuls les administrateurs et techniciens peuvent uploader des firmwares." />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Firmware</h1>
          <p className="text-gray-600 mt-1">Upload et compilation de firmware</p>
        </div>
        {(usbConnectedDevice || usbVirtualDevice) && (
          <span className="px-3 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-sm font-medium animate-pulse">
            🔌 USB {usbConnectedDevice ? 'connecté' : usbVirtualDevice ? 'virtuel' : ''}
          </span>
        )}
      </div>

      {/* Section Upload */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Fichier .ino</h2>
        
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

          {/* Barre de progression unifiée */}
          {(uploading || compiling || currentStep) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">
                  {currentStep === 'upload' && uploading && `📤 Transfert du fichier... ${uploadProgress}%`}
                  {currentStep === 'upload' && !uploading && uploadProgress === 100 && '✅ Transfert terminé'}
                  {currentStep === 'compilation' && compiling && `🔨 Compilation en cours... ${compileProgress}%`}
                  {currentStep === 'compilation' && !compiling && compileProgress === 100 && '✅ Compilation terminée'}
                  {!currentStep && 'En attente...'}
                </span>
                <span className="font-semibold">
                  {currentStep === 'upload' && `${uploadProgress}%`}
                  {currentStep === 'compilation' && `${compileProgress}%`}
                  {!currentStep && '0%'}
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

      {/* Section Compilation avec logs en direct */}
      {compiling && (
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Compilation</h2>
          
          <div className="space-y-2">
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

      {/* Modal de confirmation de suppression */}
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
              Cette action est irréversible. Le firmware et son fichier seront définitivement supprimés.
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
                    
                    // Si l'endpoint retourne 404, c'est un problème système
                    if (response.status === 404) {
                      const errorData = await response.json().catch(() => ({}))
                      const errorMessage = errorData.error || 'Endpoint de suppression non disponible'
                      throw new Error(`Erreur système: ${errorMessage}. L'endpoint DELETE n'est pas disponible sur le serveur. Veuillez contacter l'administrateur.`)
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
                    logger.error('Erreur suppression firmware:', err)
                    const errorMsg = err.message?.includes('404') || err.message?.includes('Endpoint not found')
                      ? '⚠️ L\'endpoint de suppression n\'est pas disponible sur le serveur. Le serveur distant doit être mis à jour avec la dernière version du code.'
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

      {/* Modal de confirmation si version existe déjà */}
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
            La version <strong>v{existingFirmware?.version}</strong> existe déjà dans la base de données.
          </p>
          
          {existingFirmware && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600 mb-2">
                <strong>Firmware existant :</strong>
              </p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>Version : <strong>v{existingFirmware.version}</strong></li>
                <li>Date : {new Date(existingFirmware.created_at).toLocaleString('fr-FR')}</li>
                <li>Fichier : {existingFirmware.file_path}</li>
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
                  
                  // Relancer l'upload après suppression
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

      {/* Messages d'erreur et succès */}
      {error && <ErrorMessage error={error} />}
      {success && <SuccessMessage message={success} />}

      {/* Liste des firmwares disponibles */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-4">Firmwares disponibles</h2>
        
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
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
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
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors inline-flex items-center justify-center"
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

      {/* Section Flash sur dispositifs */}
      {canFlash && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold">📱 Flasher sur les dispositifs</h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Sélectionnez un firmware pour le flasher sur les dispositifs (USB ou OTA)
              </p>
            </div>
          </div>

          {/* Sélection du firmware */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Firmware à flasher</label>
            <select
              value={selectedFirmwareForFlash?.id || ''}
              onChange={(e) => {
                const fw = firmwares.find(f => f.id === parseInt(e.target.value))
                setSelectedFirmwareForFlash(fw)
              }}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-slate-700"
            >
              <option value="">-- Sélectionner un firmware --</option>
              {firmwares
                .filter(fw => fw.status === 'compiled')
                .map((fw) => (
                  <option key={fw.id} value={fw.id}>
                    v{fw.version} {fw.is_stable ? '(Stable)' : '(Beta)'}
                  </option>
                ))}
            </select>
          </div>

          {/* Liste des dispositifs */}
          {selectedFirmwareForFlash && (
            <div className="mt-6">
              <h3 className="font-semibold mb-3">
                Dispositifs disponibles ({devices.length})
              </h3>
              {loading ? (
                <LoadingSpinner />
              ) : devices.length === 0 ? (
                <p className="text-gray-600 dark:text-gray-400">Aucun dispositif disponible</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Dispositif
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Version actuelle
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Statut
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {devices.map((device) => {
                        const deviceFirmware = device.firmware_version || 'N/A'
                        const needsUpdate = deviceFirmware !== selectedFirmwareForFlash.version
                        const isUsbConnected = usbConnectedDevice?.id === device.id
                        const isUsbVirtual = usbVirtualDevice && !device.id
                        
                        return (
                          <tr key={device.id || `virtual-${device.sim_iccid}`} className="table-row">
                            <td className="py-3 px-4">
                              <div>
                                <p className="font-semibold text-primary">
                                  {device.device_name || device.sim_iccid || 'Dispositif inconnu'}
                                </p>
                                <p className="text-xs text-gray-500 font-mono">{device.sim_iccid}</p>
                                {isUsbConnected && (
                                  <span className="inline-block mt-1 px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded text-xs">
                                    🔌 USB connecté
                                  </span>
                                )}
                                {isUsbVirtual && (
                                  <span className="inline-block mt-1 px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 rounded text-xs">
                                    🔌 USB - Non enregistré
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono text-sm">
                                {deviceFirmware}
                                {needsUpdate && (
                                  <span className="ml-2 text-orange-600 dark:text-orange-400">
                                    → v{selectedFirmwareForFlash.version}
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {device.last_seen ? (
                                <span className="text-xs text-gray-600">
                                  Vu il y a {formatTimeAgo(device.last_seen)}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-400">Jamais vu</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex gap-2">
                                {/* Bouton Flash USB */}
                                {(isUsbConnected || isUsbVirtual) && (
                                  <button
                                    onClick={() => {
                                      setDeviceForFlash(device)
                                      setSelectedFirmwareVersion(selectedFirmwareForFlash.version)
                                      setShowFlashUSBModal(true)
                                    }}
                                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors"
                                    title="Flasher via USB"
                                  >
                                    🔌 USB
                                  </button>
                                )}
                                
                                {/* Bouton Flash OTA */}
                                {device.id && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Déployer le firmware v${selectedFirmwareForFlash.version} sur ${device.device_name || device.sim_iccid} via OTA ?`)) {
                                        return
                                      }
                                      
                                      try {
                                        setOtaDeploying(prev => ({ ...prev, [device.id]: true }))
                                        setFlashError(null)
                                        
                                        await fetchJson(
                                          fetchWithAuth,
                                          API_URL,
                                          `/api.php/devices/${device.id}/ota`,
                                          {
                                            method: 'POST',
                                            body: JSON.stringify({ firmware_version: selectedFirmwareForFlash.version })
                                          },
                                          { requiresAuth: true }
                                        )
                                        
                                        setFlashMessage(`✅ OTA v${selectedFirmwareForFlash.version} programmé pour ${device.device_name || device.sim_iccid}`)
                                        await refetch()
                                      } catch (err) {
                                        setFlashError(`Erreur OTA pour ${device.device_name || device.sim_iccid}: ${err.message}`)
                                        logger.error('Erreur OTA:', err)
                                      } finally {
                                        setOtaDeploying(prev => {
                                          const next = { ...prev }
                                          delete next[device.id]
                                          return next
                                        })
                                      }
                                    }}
                                    disabled={otaDeploying[device.id]}
                                    className="px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Flasher via OTA (Over-The-Air)"
                                  >
                                    {otaDeploying[device.id] ? '⏳...' : '📡 OTA'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              
              {flashMessage && (
                <div className="mt-4">
                  <SuccessMessage message={flashMessage} onClose={() => setFlashMessage(null)} />
                </div>
              )}
              
              {flashError && (
                <div className="mt-4">
                  <ErrorMessage error={flashError} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal Flash USB */}
      <FlashUSBModal
        isOpen={showFlashUSBModal}
        onClose={() => {
          setShowFlashUSBModal(false)
          setDeviceForFlash(null)
        }}
        device={deviceForFlash || usbVirtualDevice || usbConnectedDevice}
        preselectedFirmwareVersion={selectedFirmwareVersion || selectedFirmwareForFlash?.version}
      />
    </div>
  )
}

