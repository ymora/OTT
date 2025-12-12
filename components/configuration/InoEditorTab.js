'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import { useApiData, useTimers } from '@/hooks'
import LoadingSpinner from '@/components/LoadingSpinner'
import ErrorMessage from '@/components/ErrorMessage'
import Modal from '@/components/Modal'
import logger from '@/lib/logger'

export default function InoEditorTab({ onUploadSuccess }) {
  const { fetchWithAuth, API_URL, token } = useAuth()
  const [selectedFile, setSelectedFile] = useState(null)
  const [inoContent, setInoContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isEdited, setIsEdited] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState(null)
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
  
  // Utiliser le hook useTimers pour gérer les timers avec cleanup automatique
  const { createTimeout: createTimeoutWithCleanup } = useTimers()
  const [editorMinimized, setEditorMinimized] = useState(true)
  const fileInputRef = useRef(null)
  const textareaRef = useRef(null)

  // États pour la compilation
  const [compiling, setCompiling] = useState(false)
  const [compileProgress, setCompileProgress] = useState(0)
  const [compileLogs, setCompileLogs] = useState([])
  const [compilingFirmwareId, setCompilingFirmwareId] = useState(null)
  const [compileWindowMinimized, setCompileWindowMinimized] = useState(false)
  const [copyLogsSuccess, setCopyLogsSuccess] = useState(false)
  const eventSourceRef = useRef(null)
  const compileLogsRef = useRef(null)
  const statusCheckIntervalRef = useRef(null)
  const timeoutRef = useRef(null)

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

    logger.log('[InoEditorTab] 📤 Démarrage upload firmware:', fileToUpload?.name || 'contenu édité')
    setUploading(true)
    setCurrentStep('upload')
    setError(null)
    setSuccess(null)
    setUploadProgress(0)

    try {
      const formData = new FormData()
      
      if (fileToUpload) {
        logger.debug('[InoEditorTab] Ajout fichier au FormData:', fileToUpload.name, fileToUpload.size, 'bytes')
        formData.append('firmware_ino', fileToUpload)
      } else if (contentToUpload) {
        // Créer un blob à partir du contenu édité
        logger.debug('[InoEditorTab] Création blob depuis contenu, taille:', contentToUpload.length)
        const blob = new Blob([contentToUpload], { type: 'text/plain' })
        const filename = 'firmware_' + Date.now() + '.ino'
        formData.append('firmware_ino', blob, filename)
      }
      
      formData.append('type', 'ino')
      logger.debug('[InoEditorTab] FormData créé, envoi vers:', `${API_URL}/api.php/firmwares/upload-ino`)

      if (!token) {
        logger.error('[InoEditorTab] Token manquant!')
        throw new Error('Token manquant. Veuillez vous reconnecter.')
      }

      logger.debug('[InoEditorTab] Token présent, création XMLHttpRequest...')
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
            setUploadProgress(100)
            setSuccess('Firmware uploadé avec succès !')
            
            // Notifier le parent qu'un upload a réussi
            if (onUploadSuccess && response.firmware_id) {
              onUploadSuccess(response.firmware_id)
            }
            
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
            createTimeoutWithCleanup(() => {
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
            }
          } catch {
            setError(`Erreur HTTP ${xhr.status}: ${xhr.statusText}`)
          }
          setUploading(false)
          setCurrentStep(null)
        }
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
      logger.debug('[InoEditorTab] Envoi requête XHR...')
      xhr.send(formData)
      logger.debug('[InoEditorTab] Requête XHR envoyée, attente réponse...')

    } catch (err) {
      logger.error('❌ Exception lors de l\'upload:', err)
      setError(err.message || 'Erreur lors de l\'upload')
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
    logger.debug('[InoEditorTab] handleFileSelect appelé', e.target.files)
    const file = e.target.files?.[0]
    if (!file) {
      logger.debug('[InoEditorTab] Aucun fichier sélectionné')
      return
    }

    logger.debug('[InoEditorTab] Fichier sélectionné:', file.name, file.size, 'bytes')

    if (!file.name.endsWith('.ino')) {
      logger.error('[InoEditorTab] Fichier non .ino:', file.name)
      setError('Seuls les fichiers .ino sont acceptés')
      setSelectedFile(null)
      return
    }

    logger.debug('[InoEditorTab] Fichier .ino valide, lecture du contenu...')
    setSelectedFile(file)
    setError(null)
    setSuccess(null)

    try {
      // Lire le contenu du fichier
      const reader = new FileReader()
      reader.onload = async (e) => {
        logger.debug('[InoEditorTab] Fichier lu avec succès, taille:', e.target.result?.length)
        const content = e.target.result
        setInoContent(content)
        setOriginalContent(content)
        setIsEdited(false)
        // Ne pas ouvrir l'éditeur automatiquement, seulement via le crayon

        logger.debug('[InoEditorTab] Extraction de la version depuis le contenu...')
        const version = extractVersionFromContent(content)
        logger.debug('[InoEditorTab] Version extraite:', version)
        if (!version) {
          logger.error('[InoEditorTab] Version non trouvée dans le fichier')
          setError('Version non trouvée dans le fichier .ino. Assurez-vous que FIRMWARE_VERSION_STR est défini.')
          setSelectedFile(null)
          setInoContent('')
          setOriginalContent('')
          return
        }

        // Vérifier si la version existe déjà
        logger.debug('[InoEditorTab] Vérification si la version existe déjà:', version)
        let existingFirmware = null
        let versionExists = false
        try {
          existingFirmware = await checkVersionExists(version)
          logger.debug('[InoEditorTab] Résultat vérification version:', existingFirmware ? 'existe déjà' : 'n\'existe pas')
          
          if (existingFirmware) {
            // Version existe déjà - afficher le modal
            logger.debug('[InoEditorTab] Version existe déjà, affichage du modal')
            versionExists = true
            setExistingFirmware(existingFirmware)
            setPendingFile(file)
            setShowVersionExistsModal(true)
            if (fileInputRef.current) {
              fileInputRef.current.value = ''
            }
            return
          }
        } catch (err) {
          logger.error('[InoEditorTab] Erreur lors de la vérification version:', err)
          // En cas d'erreur, on vérifie aussi dans la liste locale des firmwares
          logger.warn('Erreur lors de la vérification version via API:', err)
          
          // Fallback: vérifier dans la liste locale
          const localExisting = firmwares.find(fw => fw.version === version)
          if (localExisting) {
            versionExists = true
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
        
        // Si la version n'existe pas, lancer automatiquement l'upload
        if (!versionExists && !existingFirmware) {
          logger.debug('[InoEditorTab] Version n\'existe pas, lancement automatique de l\'upload...')
          // Attendre un court instant pour s'assurer que les états sont bien mis à jour
          createTimeoutWithCleanup(() => {
            logger.debug('[InoEditorTab] Appel handleUpload avec file et content')
            handleUpload(file, content)
          }, 100)
        } else {
          logger.debug('[InoEditorTab] Upload non lancé (versionExists:', versionExists, ', existingFirmware:', !!existingFirmware, ')')
        }
      }
      reader.onerror = (err) => {
        logger.error('[InoEditorTab] Erreur FileReader:', err)
        setError('Erreur lors de la lecture du fichier')
        setSelectedFile(null)
      }
      logger.debug('[InoEditorTab] Démarrage lecture fichier avec FileReader...')
      reader.readAsText(file)
    } catch (err) {
      logger.error('Erreur lors de la lecture du fichier:', err)
      setError('Erreur lors de la lecture du fichier')
      setSelectedFile(null)
    }
  }, [fetchWithAuth, API_URL, firmwares, checkVersionExists, handleUpload])

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
        setSuccess(hasChanges ? 'Fichier .ino mis à jour avec succès !' : 'Fichier .ino uploadé avec succès !')

        // Invalider le cache et rafraîchir la liste pour mettre à jour le tableau
        invalidateCache()
        setUploading(false)
        setOriginalContent(inoContent)
        setIsEdited(false)
        setEditingFirmwareId(null)
        // Rafraîchir après un court délai pour laisser le temps au serveur
        createTimeoutWithCleanup(() => {
          refetch().catch((err) => {
            logger.error('Erreur lors du rafraîchissement:', err)
          })
        }, 300)
      } catch (err) {
        logger.error('❌ Erreur lors de la mise à jour:', err)
        setError(err.message || 'Erreur lors de la mise à jour')
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
      createTimeoutWithCleanup(() => {
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
      createTimeoutWithCleanup(() => {
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


  // Auto-fermer les messages de succès après 4 secondes
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        setSuccess(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [success])

  // Auto-fermer les messages d'erreur après 4 secondes
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        setError(null)
      }, 4000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // Fonctions utilitaires pour la compilation
  const closeEventSource = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  const resetCompilationState = useCallback(() => {
    setCompiling(false)
    setCompilingFirmwareId(null)
    setCompileProgress(0)
    closeEventSource()
  }, [closeEventSource])

  // Compiler le firmware
  const handleCompile = useCallback(async (firmwareId) => {
    if (!firmwareId) {
      setError('ID du firmware manquant pour la compilation.')
      return
    }

    if (compiling && compilingFirmwareId === firmwareId) {
      setError('Compilation déjà en cours pour ce firmware.')
      return
    }

    // Fermer l'ancienne connexion si elle existe
    closeEventSource()

    // Réinitialiser les logs et états de compilation
    setCompiling(true)
    setCompilingFirmwareId(firmwareId)
    setCompileProgress(0)
    setError(null)
    setSuccess(null)
    setCompileWindowMinimized(false) // Ouvrir la console
    setCompileLogs([{
      timestamp: new Date().toLocaleTimeString('fr-FR'),
      message: '⏳ Démarrage de la compilation...',
      level: 'info'
    }])

    // Mettre à jour le statut du firmware dans la liste locale immédiatement
    refetch()

    try {
      const tokenEncoded = encodeURIComponent(token)
      
      // IMPORTANT: Pour les SSE, utiliser l'URL directe de l'API (pas le proxy Next.js)
      // Le proxy Next.js ne fonctionne pas correctement pour EventSource/SSE
      // Utiliser l'URL distante directement pour les SSE
      const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
      const sseApiUrl = isLocalhost 
        ? 'https://ott-jbln.onrender.com'  // URL directe pour SSE en local
        : API_URL  // En production, utiliser API_URL normal
      
      const sseUrl = `${sseApiUrl}/api.php/firmwares/compile/${firmwareId}?token=${tokenEncoded}`

      // Logger pour diagnostic
      console.log('[InoEditorTab] Connexion SSE vers:', sseUrl)
      console.log('[InoEditorTab] API_URL:', API_URL)
      console.log('[InoEditorTab] isLocalhost:', isLocalhost)
      console.log('[InoEditorTab] sseApiUrl:', sseApiUrl)
      
      setCompileLogs(prev => [...prev, {
        timestamp: new Date().toLocaleTimeString('fr-FR'),
        message: `🔗 Connexion SSE vers: ${sseApiUrl}/api.php/firmwares/compile/${firmwareId}...`,
        level: 'info'
      }])

      const eventSource = new EventSource(sseUrl)
      eventSourceRef.current = eventSource

      // Variables pour le monitoring de la connexion SSE
      let lastMessageTime = Date.now()
      // statusCheckInterval est maintenant géré via statusCheckIntervalRef (déclaré avec useRef)
      const maxSilenceTime = 60000 // 60 secondes sans message = problème
      let messageCount = 0

      eventSource.onopen = () => {
        lastMessageTime = Date.now() // Réinitialiser le timestamp à l'ouverture
        console.log('[InoEditorTab] EventSource.onopen - Connexion établie')
        setCompileLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: '✅ Connexion SSE établie, démarrage de la compilation...',
          level: 'info'
        }])
      }

      eventSource.onmessage = (event) => {
        // Mettre à jour le timestamp à chaque message reçu (même les keep-alive)
        lastMessageTime = Date.now()
        messageCount++
        
        // Logger pour diagnostic
        console.log(`[InoEditorTab] Message SSE #${messageCount} reçu:`, event.data.substring(0, 100))
        
        // Ignorer les keep-alive (lignes qui commencent par :)
        if (!event.data || event.data.trim() === '' || event.data.trim().startsWith(':')) {
          // Logger les keep-alive pour diagnostic (tous les 10)
          if (messageCount % 10 === 0) {
            console.log(`[InoEditorTab] Keep-alive reçu (#${messageCount})`)
          }
          return // Ignorer les keep-alive
        }

        try {
          const data = JSON.parse(event.data)
          console.log(`[InoEditorTab] Message parsé:`, data.type, data.message?.substring(0, 50))
          
          // Afficher TOUS les types de messages
          if (data.type === 'log') {
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: data.message,
              level: data.level || 'info'
            }])
          } else if (data.type === 'progress') {
            // S'assurer que la progression ne peut que monter (éviter les retours en arrière)
            setCompileProgress(prev => {
              const newProgress = data.progress || 0
              return Math.max(prev, newProgress) // Ne garder que la valeur la plus élevée
            })
            // Ne plus afficher la progression dans les logs, seulement dans la barre
          } else if (data.type === 'success') {
            setSuccess(`✅ Compilation réussie ! Firmware v${data.version} disponible`)
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `✅ Compilation terminée avec succès ! Firmware v${data.version} disponible`,
              level: 'info'
            }])
            resetCompilationState()
            eventSource.close()
            if (statusCheckIntervalRef.current) {
              clearInterval(statusCheckIntervalRef.current)
              statusCheckIntervalRef.current = null
            }
            refetch() // Rafraîchir la liste des firmwares
          } else if (data.type === 'error') {
            setError(data.message || 'Erreur lors de la compilation')
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `❌ Erreur de compilation: ${data.message || 'Inconnue'}`,
              level: 'error'
            }])
            resetCompilationState()
            eventSource.close()
            if (statusCheckIntervalRef.current) {
              clearInterval(statusCheckIntervalRef.current)
              statusCheckIntervalRef.current = null
            }
            refetch() // Rafraîchir la liste des firmwares
          } else {
            // Afficher les messages de type inconnu pour diagnostic
            setCompileLogs(prev => [...prev, {
              timestamp: new Date().toLocaleTimeString('fr-FR'),
              message: `[${data.type || 'unknown'}] ${JSON.stringify(data)}`,
              level: 'info'
            }])
          }
        } catch (err) {
          // Afficher le message brut si le parsing échoue (pour diagnostic)
          setCompileLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('fr-FR'),
            message: `⚠️ Message brut (parse error): ${event.data.substring(0, 200)}`,
            level: 'warning'
          }])
          console.error('Erreur parsing SSE:', err, 'Data:', event.data)
        }
      }

      // Ajouter un timeout de sécurité pour détecter les connexions qui se ferment silencieusement
      statusCheckIntervalRef.current = setInterval(() => {
        const timeSinceLastMessage = Date.now() - lastMessageTime
        if (timeSinceLastMessage > maxSilenceTime && compiling) {
          setCompileLogs(prev => [...prev, {
            timestamp: new Date().toLocaleTimeString('fr-FR'),
            message: '⚠️ Pas de message depuis plus de 60 secondes. Vérification du statut...',
            level: 'warning'
          }])
          // Vérifier le statut du firmware
          fetchWithAuth(`${API_URL}/api.php/firmwares`)
            .then(response => response.json())
            .then(data => {
              if (data.success && data.firmwares) {
                const firmware = data.firmwares.find(f => f.id === firmwareId)
                if (firmware) {
                  if (firmware.status === 'compiled') {
                    setSuccess(`✅ Compilation réussie ! Firmware v${firmware.version} disponible`)
                    setCompileLogs(prev => [...prev, {
                      timestamp: new Date().toLocaleTimeString('fr-FR'),
                      message: '✅ Compilation terminée avec succès (détectée par vérification périodique)',
                      level: 'info'
                    }])
                    resetCompilationState()
                    refetch()
                    if (statusCheckIntervalRef.current) {
                      clearInterval(statusCheckIntervalRef.current)
                      statusCheckIntervalRef.current = null
                    }
                  } else if (firmware.status === 'error') {
                    setError(`Erreur de compilation: ${firmware.error_message || 'Erreur inconnue'}`)
                    resetCompilationState()
                    refetch()
                    if (statusCheckIntervalRef.current) {
                      clearInterval(statusCheckIntervalRef.current)
                      statusCheckIntervalRef.current = null
                    }
                  }
                }
              }
            })
            .catch(err => {
              setCompileLogs(prev => [...prev, {
                timestamp: new Date().toLocaleTimeString('fr-FR'),
                message: '⚠️ Impossible de vérifier le statut. La compilation peut continuer en arrière-plan.',
                level: 'warning'
              }])
            })
        }
      }, 10000) // Vérifier toutes les 10 secondes

      eventSource.onerror = (err) => {
        // Ne pas fermer immédiatement - la connexion peut se rétablir
        // Le processus PHP continue grâce à ignore_user_abort(true)
        const errorMsg = err.message || 'Connexion interrompue'
        setCompileLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: `⚠️ Connexion SSE interrompue: ${errorMsg}`,
          level: 'warning'
        }])
        setCompileLogs(prev => [...prev, {
          timestamp: new Date().toLocaleTimeString('fr-FR'),
          message: 'ℹ️ La compilation continue en arrière-plan. Vérification du statut...',
          level: 'info'
        }])
        
        // Ne pas fermer immédiatement - attendre un peu pour voir si la connexion se rétablit
        // EventSource essaie automatiquement de se reconnecter
        createTimeoutWithCleanup(() => {
          // Si la connexion est fermée (readyState === 2), vérifier le statut du firmware
          if (eventSource.readyState === EventSource.CLOSED) {
            // Vérifier le statut du firmware après 3 secondes (plus rapide)
            createTimeoutWithCleanup(async () => {
              try {
                const response = await fetchWithAuth(`${API_URL}/api.php/firmwares`)
                const data = await response.json()
                if (data.success && data.firmwares) {
                  const firmware = data.firmwares.find(f => f.id === firmwareId)
                  if (firmware) {
                    if (firmware.status === 'compiled') {
                      setSuccess(`✅ Compilation réussie ! Firmware v${firmware.version} disponible`)
                      setCompileLogs(prev => [...prev, {
                        timestamp: new Date().toLocaleTimeString('fr-FR'),
                        message: '✅ Compilation terminée avec succès (vérifiée après reconnexion)',
                        level: 'info'
                      }])
                      resetCompilationState()
                      refetch()
                      if (statusCheckIntervalRef.current) {
                        clearInterval(statusCheckIntervalRef.current)
                        statusCheckIntervalRef.current = null
                      }
                    } else if (firmware.status === 'compiling') {
                      setCompileLogs(prev => [...prev, {
                        timestamp: new Date().toLocaleTimeString('fr-FR'),
                        message: '⏳ La compilation est toujours en cours. Vérification périodique activée...',
                        level: 'info'
                      }])
                    } else if (firmware.status === 'error') {
                      setError(`Erreur de compilation: ${firmware.error_message || 'Erreur inconnue'}`)
                      resetCompilationState()
                      refetch()
                      if (statusCheckIntervalRef.current) {
                        clearInterval(statusCheckIntervalRef.current)
                        statusCheckIntervalRef.current = null
                      }
                    }
                  }
                }
              } catch (checkErr) {
                setCompileLogs(prev => [...prev, {
                  timestamp: new Date().toLocaleTimeString('fr-FR'),
                  message: '⚠️ Impossible de vérifier le statut. La compilation peut continuer en arrière-plan.',
                  level: 'warning'
                }])
              }
            }, 3000)
          }
        }, 2000)
      }
      

    } catch (err) {
      setError(err.message || 'Erreur lors du démarrage de la compilation.')
      resetCompilationState()
    }
  }, [API_URL, token, compiling, compilingFirmwareId, closeEventSource, resetCompilationState, refetch])

  // Fermer EventSource au démontage et nettoyer les intervalles
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        closeEventSource()
      }
      // Nettoyer tous les intervalles potentiels
      const highestIntervalId = setInterval(() => {}, 9999)
      for (let i = 0; i < highestIntervalId; i++) {
        clearInterval(i)
      }
    }
  }, [closeEventSource])

  // Auto-scroll des logs de compilation
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
      setCopyLogsSuccess(true)
      createTimeoutWithCleanup(() => setCopyLogsSuccess(false), 2000)
    }).catch(err => {
      setError('Erreur lors de la copie des logs')
    })
  }, [compileLogs])

  return (
    <div className="space-y-6">
      {/* Liste des fichiers .ino existants - EN HAUT */}
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
                        {/* Bouton de compilation */}
                        <button
                          onClick={() => handleCompile(fw.id)}
                          disabled={compiling && compilingFirmwareId === fw.id}
                          className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title={compiling && compilingFirmwareId === fw.id ? "Compilation en cours..." : "Compiler le firmware"}
                        >
                          <span className="text-lg">🔨</span>
                        </button>
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

      {/* Console de compilation */}
      {(compiling || compileLogs.length > 0) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">📊 Progression</h2>
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
                  {copyLogsSuccess ? '✅ Copié!' : '📋 Copier'}
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
                    <div key={idx} className="mb-1 break-words whitespace-pre-wrap">
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

      {/* Gros bouton violet "Ajouter" */}
      <div className="card">
        <input
          ref={fileInputRef}
          type="file"
          accept=".ino"
          onChange={handleFileSelect}
          disabled={uploading}
          className="hidden"
          id="file-upload-input"
        />
        <label
          htmlFor="file-upload-input"
          className={`
            block w-full py-4 px-6 text-center text-lg font-semibold rounded-lg
            bg-purple-600 hover:bg-purple-700 text-white
            transition-all duration-200 cursor-pointer
            disabled:opacity-50 disabled:cursor-not-allowed
            ${uploading ? 'opacity-50 cursor-not-allowed' : 'hover:shadow-lg'}
          `}
        >
          {uploading ? '⏳ Upload en cours...' : '➕ Ajouter'}
        </label>
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
                    ⚠️ Le fichier a été modifié. N&apos;oubliez pas d&apos;enregistrer !
                  </p>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p className="mb-2">Aucun fichier chargé</p>
                <p className="text-sm">Sélectionnez un fichier .ino ci-dessus ou cliquez sur un fichier existant pour l&apos;éditer</p>
              </div>
            )}
          </div>
        )}
        </div>
      )}

      {/* Messages d'erreur */}
      {error && <ErrorMessage error={error} onClose={() => setError(null)} autoClose={4000} />}

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
                      createTimeoutWithCleanup(() => {
                        handleUpload(fileToUpload)
                      }, 500)
                    } else if (inoContent) {
                      createTimeoutWithCleanup(() => {
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

