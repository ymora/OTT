'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getUsbDeviceLabel, getUsbRequestFilters } from '@/lib/usbDevices'
import logger from '@/lib/logger'
import { getUsbPortSharing } from '@/lib/usbPortSharing'

/**
 * Gestionnaire de port série utilisant Web Serial API
 * Permet de détecter, connecter et communiquer avec des dispositifs USB
 */
export function useSerialPort() {
  const [port, setPort] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [availablePorts, setAvailablePorts] = useState([])
  const [error, setError] = useState(null)
  const readerRef = useRef(null)
  const writerRef = useRef(null)
  const portSharingRef = useRef(null)
  const isMasterRef = useRef(false)
  const sharedDataRef = useRef(null)

  // Vérifier le support de Web Serial API
  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator
  
  // Initialiser le système de partage (une seule fois au montage)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      portSharingRef.current = getUsbPortSharing()
      
      // Debounce pour éviter les oscillations
      let stateChangeTimeout = null
      
      // Écouter les changements d'état
      const unsubscribeState = portSharingRef.current.on('state-changed', async (data) => {
        // Debounce : attendre 500ms avant de traiter le changement d'état
        if (stateChangeTimeout) {
          clearTimeout(stateChangeTimeout)
        }
        
        stateChangeTimeout = setTimeout(async () => {
          const wasMaster = isMasterRef.current
          isMasterRef.current = data.isMaster
          logger.debug('[SerialPortManager] State changed (debounced):', data)
          
          // Si on n'est plus master mais qu'on a un port ouvert, le fermer automatiquement
          // Utiliser les refs pour éviter les dépendances
          const currentPort = port
          const currentIsConnected = isConnected
          
          if (!data.isMaster && wasMaster && currentIsConnected && currentPort) {
            logger.warn('[SerialPortManager] No longer master, closing port automatically...')
            try {
              // Fermer le port sans notifier le système de partage (car on n'est plus master)
              if (readerRef.current) {
                try {
                  await readerRef.current.cancel()
                } catch (e) {
                  // Ignorer les erreurs
                }
                readerRef.current = null
              }
              if (writerRef.current) {
                writerRef.current = null
              }
              if (currentPort) {
                try {
                  await currentPort.close()
                } catch (e) {
                  // Ignorer les erreurs
                }
              }
              setIsConnected(false)
              setPort(null)
              logger.debug('[SerialPortManager] Port closed after losing master status')
            } catch (err) {
              logger.error('[SerialPortManager] Error closing port after losing master status:', err)
            }
          }
        }, 500) // Debounce de 500ms
      })
      
      // Écouter les données reçues depuis un autre onglet (si on n'est pas master)
      const unsubscribeData = portSharingRef.current.on('data-received', (data) => {
        if (!isMasterRef.current) {
          sharedDataRef.current = data
          logger.debug('[SerialPortManager] Data received from master tab')
        }
      })
      
      return () => {
        if (stateChangeTimeout) {
          clearTimeout(stateChangeTimeout)
        }
        unsubscribeState()
        unsubscribeData()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Dépendances vides = initialisation unique

  // Demander l'accès à un port série
  const requestPort = useCallback(async () => {
    if (!isSupported) {
      setError('Web Serial API non supporté par ce navigateur. Utilisez Chrome ou Edge.')
      return null
    }

    try {
      setError(null)
      const filters = getUsbRequestFilters()
      const requestOptions = filters.length > 0 ? { filters } : undefined
      const selectedPort = await navigator.serial.requestPort(requestOptions)
      setPort(selectedPort)
      const info = selectedPort?.getInfo?.()
      const label = getUsbDeviceLabel(info)
      if (label) {
        logger.log(`[USB] Port sélectionné: ${label}`)
      }
      return selectedPort
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        setError(`Erreur lors de la sélection du port: ${err.message}`)
      }
      return null
    }
  }, [isSupported])

  // Connecter au port série
  const connect = useCallback(async (selectedPort = null, baudRate = 115200) => {
    const portToUse = selectedPort || port
    if (!portToUse) {
      setError('Aucun port sélectionné')
      return false
    }

    // Vérifier si un autre onglet a déjà ouvert le port AVANT d'essayer de l'ouvrir
    if (portSharingRef.current) {
      const sharing = portSharingRef.current
      
      // Vérifier l'état actuel
      sharing.checkState()
      
      // Si on n'est pas master, essayer de devenir master
      if (!sharing.isMaster) {
        logger.debug('[SerialPortManager] Not master, requesting master status...')
        const becameMaster = await sharing.requestMaster()
        if (!becameMaster) {
          // Un autre onglet est master et a déjà ouvert le port
          // On ne peut PAS ouvrir le port ici, on doit juste écouter les données partagées
          logger.warn('[SerialPortManager] Port already open in another tab, listening to shared data only')
          // Mettre à jour l'état pour indiquer qu'on écoute les données du master
          setIsConnected(true) // On est "connecté" via le partage
          setPort(null) // Pas de port local, mais on écoute les données partagées
          setError(null) // Pas d'erreur, c'est normal
          return true // Retourner true car on est "connecté" via le partage
        }
        // On est devenu master, on peut maintenant ouvrir le port
        isMasterRef.current = true
        logger.debug('[SerialPortManager] Became master, can open port')
      } else {
        // On est déjà master, on peut ouvrir le port
        isMasterRef.current = true
        logger.debug('[SerialPortManager] Already master, can open port')
      }
    } else {
      // Pas de système de partage, on peut ouvrir le port normalement
      isMasterRef.current = true
    }

    try {
      setError(null)
      
      // Libérer les anciens writers/readers s'ils existent
      if (writerRef.current) {
        // Note: writer n'a pas de méthode release() dans Web Serial API
        writerRef.current = null
      }
      
      if (readerRef.current) {
        try {
          await readerRef.current.cancel()
          // Note: reader n'a pas de méthode release() dans Web Serial API
        } catch (e) {
          // Ignorer les erreurs
        }
        readerRef.current = null
      }
      
      // Vérifier si le port est déjà ouvert dans CET onglet
      // Si readable et writable existent, le port est déjà ouvert dans cet onglet
      if (portToUse.readable && portToUse.writable) {
        logger.debug('[SerialPortManager] connect: port déjà ouvert dans cet onglet, vérification des locks...')
        logger.debug('[SerialPortManager] connect: writable.locked =', portToUse.writable.locked)
        logger.debug('[SerialPortManager] connect: readable.locked =', portToUse.readable.locked)
        
        // ⚠️ IMPORTANT: Si le port est déjà ouvert ET qu'on a déjà un reader/writer actif,
        // on ne doit PAS fermer et rouvrir le port ! C'est inutile et cause des déconnexions.
        // On vérifie d'abord si on a déjà des refs actives
        const hasActiveReader = readerRef.current !== null
        const hasActiveWriter = writerRef.current !== null
        
        // Si les streams sont verrouillés ET qu'on a déjà des refs actives, c'est normal
        // Le port fonctionne correctement, on ne doit rien faire
        if ((portToUse.writable.locked || portToUse.readable.locked) && (hasActiveReader || hasActiveWriter)) {
          logger.debug('[SerialPortManager] connect: port déjà ouvert et actif, réutilisation sans fermeture...')
          setIsConnected(true)
          setPort(portToUse)
          setError(null)
          return true // Port déjà connecté et fonctionnel, pas besoin de le rouvrir
        }
        
        // Si les streams sont verrouillés mais qu'on n'a PAS de refs actives,
        // c'est qu'un autre onglet utilise le port
        if (portToUse.writable.locked || portToUse.readable.locked) {
          // Vérifier qu'on est toujours master avant de fermer/rouvrir
          if (portSharingRef.current) {
            portSharingRef.current.checkState()
            if (!portSharingRef.current.isMaster) {
              logger.debug('[SerialPortManager] connect: port verrouillé par un autre onglet, écoute des données partagées...')
              setError(null) // Pas d'erreur, c'est normal
              setIsConnected(true) // On est "connecté" via le partage
              setPort(null) // Pas de port local
              return true // Retourner true car on écoute les données partagées
            }
          }
          
          // Si on est master mais qu'on n'a pas de refs actives, on doit récupérer le port
          if (!isMasterRef.current) {
            logger.debug('[SerialPortManager] connect: port verrouillé mais on n\'est pas master - un autre onglet a le port')
            setError(null) // Pas d'erreur, c'est normal
            setIsConnected(true) // On est "connecté" via le partage
            setPort(null) // Pas de port local
            return true // Retourner true car on écoute les données partagées
          }
          
          // Cas rare : port verrouillé mais on est master et on n'a pas de refs
          // On doit libérer les locks en annulant les readers/writers existants
          logger.warn('[SerialPortManager] connect: port verrouillé sans refs actives, libération des locks...')
          try {
            // Essayer de libérer les locks en annulant les readers/writers
            // Note: On ne peut pas forcer la libération, mais on peut essayer
            if (readerRef.current) {
              try {
                await readerRef.current.cancel()
              } catch (e) {
                logger.warn('[SerialPortManager] connect: erreur cancel reader:', e)
              }
              readerRef.current = null
            }
            
            if (writerRef.current) {
              writerRef.current = null
            }
            
            // Attendre un peu pour que les locks se libèrent
            await new Promise(resolve => setTimeout(resolve, 200))
            
            // Vérifier si les locks sont toujours actifs
            if (portToUse.writable.locked || portToUse.readable.locked) {
              logger.warn('[SerialPortManager] connect: port toujours verrouillé après libération, réutilisation impossible')
              setError('Port verrouillé par une autre application. Fermez les autres applications utilisant ce port.')
              return false
            }
            
            // Les locks sont libérés, on peut continuer
            logger.debug('[SerialPortManager] connect: locks libérés, création des refs...')
          } catch (cleanupErr) {
            logger.error('[SerialPortManager] connect: erreur libération locks:', cleanupErr)
            setError(`Erreur lors de la libération des locks: ${cleanupErr.message}`)
            return false
          }
        }
        
        // Port ouvert et non verrouillé (ou locks libérés), on peut réutiliser
        logger.debug('[SerialPortManager] connect: port disponible, réutilisation...')
        try {
          // Créer le writer seulement si on n'en a pas déjà un
          if (!writerRef.current) {
            logger.debug('[SerialPortManager] connect: création du writer...')
            const writer = portToUse.writable.getWriter()
            writerRef.current = writer
          }

          // Créer le reader seulement si on n'en a pas déjà un
          if (!readerRef.current) {
            logger.debug('[SerialPortManager] connect: création du reader...')
            const reader = portToUse.readable.getReader()
            readerRef.current = reader
          }

          setIsConnected(true)
          setPort(portToUse)
          
          // Notifier le système de partage que le port est ouvert
          if (portSharingRef.current && isMasterRef.current) {
            portSharingRef.current.notifyPortOpened({
              baudRate,
              timestamp: Date.now()
            })
          }
          
          logger.debug('[SerialPortManager] connect: ✅ port réutilisé avec succès')
          return true
        } catch (err) {
          logger.error('[SerialPortManager] connect: erreur réutilisation port:', err)
          setError(`Erreur lors de la réutilisation du port: ${err.message}`)
          setIsConnected(false)
          return false
        }
      }
      
      // Ouvrir le port (soit nouveau, soit après fermeture complète)
      logger.debug('[SerialPortManager] connect: ouverture du port...')
      try {
        await portToUse.open({ baudRate })
        logger.debug('[SerialPortManager] connect: port ouvert')
      } catch (openErr) {
        // Si le port est déjà ouvert, essayer de réutiliser
        if (openErr.name === 'InvalidStateError' && portToUse.readable && portToUse.writable) {
          logger.debug('[SerialPortManager] connect: port déjà ouvert (InvalidStateError), réutilisation...')
          // Vérifier si les streams sont verrouillés
          if (portToUse.writable.locked || portToUse.readable.locked) {
            setError('Port toujours verrouillé après nettoyage. Attendez quelques secondes et réessayez.')
            logger.error('[SerialPortManager] connect: port toujours verrouillé après nettoyage')
            setIsConnected(false)
            return false
          }
        } else {
          throw openErr
        }
      }

      // Créer le writer
      logger.debug('[SerialPortManager] connect: création du writer...')
      const writer = portToUse.writable.getWriter()
      writerRef.current = writer
      logger.debug('[SerialPortManager] connect: writer créé')

      // Créer le reader
      logger.debug('[SerialPortManager] connect: création du reader...')
      const reader = portToUse.readable.getReader()
      readerRef.current = reader
      logger.debug('[SerialPortManager] connect: reader créé')

      setIsConnected(true)
      setPort(portToUse)
      logger.debug('[SerialPortManager] connect: ✅ connexion réussie')
      return true
    } catch (err) {
      // Si le port est déjà ouvert, essayer de réutiliser
      if (err.name === 'InvalidStateError' && portToUse.readable && portToUse.writable) {
        try {
          // Vérifier si les streams sont verrouillés
          if (portToUse.writable.locked || portToUse.readable.locked) {
            setError('Port déjà utilisé par une autre connexion. Déconnectez d\'abord.')
            setIsConnected(false)
            return false
          }
          
          const writer = portToUse.writable.getWriter()
          writerRef.current = writer
          const reader = portToUse.readable.getReader()
          readerRef.current = reader
          setIsConnected(true)
          setPort(portToUse)
          return true
        } catch (retryErr) {
          setError(`Erreur de connexion (port déjà ouvert): ${retryErr.message}`)
          setIsConnected(false)
          return false
        }
      }
      setError(`Erreur de connexion: ${err.message}`)
      setIsConnected(false)
      return false
    }
  }, [port])

  // Déconnecter
  const disconnect = useCallback(async () => {
    logger.debug('[SerialPortManager] disconnect: début')
    try {
      // Arrêter le reader d'abord
      if (readerRef.current) {
        logger.debug('[SerialPortManager] disconnect: arrêt du reader...')
        try {
          await readerRef.current.cancel()
        } catch (cancelErr) {
          logger.warn('[SerialPortManager] disconnect: erreur cancel reader:', cancelErr)
        }
        // Note: reader n'a pas de méthode release() dans Web Serial API
        // Il est automatiquement libéré quand on ferme le port
        readerRef.current = null
        logger.debug('[SerialPortManager] disconnect: reader libéré')
      }

      // Note: writer n'a pas de méthode release() dans Web Serial API
      // Il est automatiquement libéré quand on ferme le port
      if (writerRef.current) {
        logger.debug('[SerialPortManager] disconnect: writer sera libéré avec le port')
        writerRef.current = null
      }

      // Fermer le port
      if (port) {
        logger.debug('[SerialPortManager] disconnect: fermeture du port...')
        try {
          await port.close()
          logger.debug('[SerialPortManager] disconnect: port fermé')
        } catch (closeErr) {
          logger.warn('[SerialPortManager] disconnect: erreur fermeture port:', closeErr)
        }
      }

      setIsConnected(false)
      setPort(null)
      setError(null)
      
      // Notifier le système de partage que le port est fermé
      if (portSharingRef.current && isMasterRef.current) {
        portSharingRef.current.notifyPortClosed()
        isMasterRef.current = false
        logger.debug('[SerialPortManager] Notified port sharing system (port closed)')
      }
      
      logger.debug('[SerialPortManager] disconnect: ✅ déconnexion complète')
    } catch (err) {
      logger.error('[SerialPortManager] disconnect: ❌ erreur:', err)
      setError(`Erreur de déconnexion: ${err.message}`)
    }
  }, [port])

  // Démarrer la lecture en continu
  const startReading = useCallback(async (onData, explicitPort = null) => {
    // Utiliser le port explicite si fourni, sinon utiliser le port du contexte
    const portToUse = explicitPort || port
    
    // Vérifier directement le port au lieu de compter sur isConnected qui peut avoir un délai
    const portIsAvailable = portToUse && portToUse.readable && portToUse.writable
    const readerIsAvailable = readerRef.current
    
    logger.debug('[SerialPortManager] startReading: vérifications...')
    logger.debug('[SerialPortManager] startReading: explicitPort fourni =', !!explicitPort)
    logger.debug('[SerialPortManager] startReading: port du contexte =', !!port)
    logger.debug('[SerialPortManager] startReading: portToUse =', !!portToUse)
    logger.debug('[SerialPortManager] startReading: isConnected =', isConnected)
    logger.debug('[SerialPortManager] startReading: portToUse.readable =', !!portToUse?.readable)
    logger.debug('[SerialPortManager] startReading: portToUse.writable =', !!portToUse?.writable)
    logger.debug('[SerialPortManager] startReading: readerRef.current =', !!readerRef.current)
    
    // Si le port n'est pas disponible, attendre un peu et réessayer (avec retry)
    if (!portIsAvailable && !readerIsAvailable) {
      logger.warn('[SerialPortManager] startReading: Port non disponible immédiatement, tentative de retry...')
      
      // Retry jusqu'à 5 fois avec délai de 200ms
      let retries = 0
      const maxRetries = 5
      while (retries < maxRetries && !portIsAvailable) {
        await new Promise(resolve => setTimeout(resolve, 200))
        retries++
        const portCheck = portToUse && portToUse.readable && portToUse.writable
        if (portCheck) {
          logger.log(`✅ [SerialPortManager] Port disponible après ${retries} tentative(s)`)
          break
        }
        logger.debug(`⏳ [SerialPortManager] Retry ${retries}/${maxRetries} - port toujours indisponible`)
      }
      
      // Vérifier une dernière fois
      const finalCheck = portToUse && portToUse.readable && portToUse.writable
      if (!finalCheck && !readerIsAvailable) {
        logger.error('[SerialPortManager] startReading: Port non disponible après retries (portToUse:', !!portToUse, 'readable:', !!portToUse?.readable, 'writable:', !!portToUse?.writable, 'reader:', !!readerRef.current, ')')
        setError('Port non disponible. Le port doit être connecté avant de démarrer la lecture.')
        throw new Error('Port non disponible. Le port doit être connecté avant de démarrer la lecture.')
      }
    }

    // Si le reader n'existe pas mais le port est disponible, créer le reader
    if (!readerRef.current && portIsAvailable) {
      logger.debug('[SerialPortManager] startReading: création du reader...')
      try {
        if (portToUse.readable.locked) {
          logger.error('[SerialPortManager] startReading: readable est verrouillé')
          setError('Port readable verrouillé. Déconnectez et reconnectez.')
          return () => {}
        }
        readerRef.current = portToUse.readable.getReader()
        logger.debug('[SerialPortManager] startReading: reader créé')
      } catch (err) {
        logger.error('[SerialPortManager] startReading: erreur création reader:', err)
        setError(`Erreur création reader: ${err.message}`)
        return () => {}
      }
    }
    
    if (!readerRef.current) {
      logger.error('[SerialPortManager] startReading: Reader non disponible après tentative de création')
      setError('Reader non disponible. Le port doit être connecté avant de démarrer la lecture.')
      return () => {}
    }

    let reading = true
    let readLoopActive = true
    let consecutiveErrors = 0
    const MAX_CONSECUTIVE_ERRORS = 5 // Arrêter après 5 erreurs consécutives
    
    const readLoop = async () => {
      try {
        logger.log('🔵 [SerialPortManager] Démarrage de la boucle de lecture...')
        let readCount = 0
        let lastHeartbeat = Date.now()
        
        while (reading && readLoopActive) {
          // Heartbeat toutes les 5 secondes pour vérifier que la boucle est active
          const now = Date.now()
          if (now - lastHeartbeat > 5000) {
            logger.log(`💓 [SerialPortManager] Heartbeat - Boucle active (${readCount} lectures effectuées)`)
            lastHeartbeat = now
          }
          
          // Vérifier que le reader existe toujours
          if (!readerRef.current) {
            logger.error('❌ [SerialPortManager] Reader perdu, arrêt de la lecture')
            break
          }

          try {
            readCount++
            logger.debug(`📖 [SerialPortManager] Appel read() #${readCount}...`)
            const { value, done } = await readerRef.current.read()
            logger.debug(`📥 [SerialPortManager] read() #${readCount} retourné - done: ${done}, value: ${value ? `${value.length} bytes` : 'null'}`)
            
            // Réinitialiser le compteur d'erreurs en cas de succès
            consecutiveErrors = 0
            
            if (done) {
              logger.warn('⚠️ [SerialPortManager] Stream terminé (done=true)')
              break
            }
            
            if (value) {
              // Convertir Uint8Array en string
              const text = new TextDecoder().decode(value)
              logger.log(`✅ [SerialPortManager] Données reçues: ${text.length} caractères - "${text.substring(0, Math.min(50, text.length))}${text.length > 50 ? '...' : ''}"`)
              
              if (text && text.length > 0) {
                if (onData) {
                  logger.log(`📤 [SerialPortManager] Appel onData avec ${text.length} caractères`)
                  onData(text)
                  logger.debug(`✅ [SerialPortManager] onData appelé avec succès`)
                } else {
                  logger.error('❌ [SerialPortManager] onData est null/undefined !')
                }
              } else {
                logger.warn(`⚠️ [SerialPortManager] Texte vide après décodage (${text.length} caractères)`)
              }
            } else {
              logger.debug(`ℹ️ [SerialPortManager] read() retourné sans valeur (value=null)`)
            }
          } catch (readErr) {
            // Erreur lors de la lecture d'un chunk
            if (readErr.name === 'NetworkError') {
              // Erreur réseau normale (déconnexion)
              logger.debug('[SerialPortManager] Erreur réseau (déconnexion probable)')
              break
            } else if (readErr.name === 'TypeError' && readErr.message.includes('cancel')) {
              // Lecture annulée explicitement
              logger.debug('[SerialPortManager] Lecture annulée')
              break
            } else if (readErr.name === 'FramingError' || readErr.message?.includes('Framing')) {
              // Erreur de framing : souvent temporaire, ignorer et continuer
              // IMPORTANT: Ne pas incrémenter consecutiveErrors pour les erreurs de framing
              // car elles sont souvent dues à des problèmes de timing et ne doivent pas
              // interrompre la communication
              if (consecutiveErrors === 0) {
                // Logger une seule fois au début
                logger.warn(`[SerialPortManager] Erreurs de framing détectées (continuation silencieuse...)`)
              }
              // Réinitialiser le compteur d'erreurs pour ne pas bloquer la communication
              consecutiveErrors = 0
              // Attendre un peu avant de continuer pour laisser le port se stabiliser
              await new Promise(resolve => setTimeout(resolve, 50))
              continue
            } else {
              consecutiveErrors++
              
              // Log l'erreur seulement la première fois et après plusieurs erreurs
              if (consecutiveErrors === 1) {
                logger.error('[SerialPortManager] Erreur lors de la lecture:', readErr)
              } else if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                logger.error(`[SerialPortManager] Trop d'erreurs consécutives (${consecutiveErrors}), arrêt de la lecture`)
                setError(`Erreur de lecture répétée: ${readErr.message}`)
                break
              } else {
                // Log en debug pour éviter le spam
                logger.debug(`[SerialPortManager] Erreur ${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}:`, readErr.message)
              }
              
              // Attendre un peu avant de réessayer pour éviter la boucle infinie
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        }
        logger.debug('[SerialPortManager] Boucle de lecture terminée')
      } catch (err) {
        logger.error('[SerialPortManager] Erreur dans la boucle de lecture:', err)
        if (err.name !== 'NetworkError' && reading) {
          setError(`Erreur de lecture: ${err.message}`)
        }
      } finally {
        readLoopActive = false
      }
    }

    // Démarrer la boucle de lecture (ne pas await pour ne pas bloquer)
    readLoop().catch(err => {
      logger.error('[SerialPortManager] Erreur non gérée dans readLoop:', err)
      readLoopActive = false
    })
    
    // Retourner une fonction pour arrêter la lecture
    return () => {
      logger.debug('[SerialPortManager] Arrêt de la lecture demandé')
      reading = false
      readLoopActive = false
      // Ne pas annuler le reader ici car il peut être utilisé ailleurs
    }
  }, [isConnected, setError])

  // Écrire des données
  const write = useCallback(async (data) => {
    logger.debug('[SerialPortManager] write: appelé avec', typeof data === 'string' ? data.length : 'non-string', 'caractères')
    logger.debug('[SerialPortManager] write: writerRef.current existe?', !!writerRef.current)
    logger.debug('[SerialPortManager] write: port existe?', !!port)
    logger.debug('[SerialPortManager] write: port.writable existe?', !!port?.writable)
    logger.debug('[SerialPortManager] write: port.writable.locked?', port?.writable?.locked)
    logger.debug('[SerialPortManager] write: isConnected?', isConnected)
    
    // Vérifier que data est une string
    if (typeof data !== 'string') {
      const errorMsg = 'Les données doivent être une string'
      setError(errorMsg)
      logger.error('[SerialPortManager] write:', errorMsg, 'type reçu:', typeof data)
      return false
    }
    
    // Vérifier que le writer existe (plus fiable que isConnected qui peut avoir un délai)
    if (!writerRef.current) {
      logger.warn('[SerialPortManager] write: writerRef.current est null, tentative de création...')
      // Vérifier aussi si le port est ouvert directement
      if (!port || !port.writable) {
        const errorMsg = 'Port non connecté ou writer non disponible'
        setError(errorMsg)
        logger.error('[SerialPortManager] write:', errorMsg, 'port:', !!port, 'writable:', !!port?.writable)
        return false
      }
      // Si le port est ouvert mais pas de writer, essayer d'en créer un
      try {
        if (port.writable && !port.writable.locked) {
          logger.debug('[SerialPortManager] write: création d\'un nouveau writer...')
          writerRef.current = port.writable.getWriter()
          logger.debug('[SerialPortManager] write: writer créé avec succès')
        } else {
          const errorMsg = 'Port writable verrouillé ou non disponible'
          setError(errorMsg)
          logger.error('[SerialPortManager] write:', errorMsg, 'locked:', port.writable?.locked)
          return false
        }
      } catch (err) {
        const errorMsg = `Erreur création writer: ${err.message}`
        setError(errorMsg)
        logger.error('[SerialPortManager] write:', errorMsg, err)
        return false
      }
    }

    try {
      const encoder = new TextEncoder()
      const dataArray = encoder.encode(data)
      logger.debug('[SerialPortManager] write: envoi de', dataArray.length, 'bytes via writerRef.current')
      logger.debug('[SerialPortManager] write: contenu (hex):', Array.from(dataArray).map(b => b.toString(16).padStart(2, '0')).join(' '))
      logger.debug('[SerialPortManager] write: contenu (ascii):', data.replace(/\n/g, '\\n').replace(/\r/g, '\\r'))
      
      await writerRef.current.write(dataArray)
      logger.debug('[SerialPortManager] write: ✅ données envoyées avec succès')
      return true
    } catch (err) {
      const errorMsg = `Erreur d'écriture: ${err.message}`
      setError(errorMsg)
      logger.error('[SerialPortManager] write: ❌ erreur lors de l\'écriture:', err)
      // Si l'erreur est liée au writer, le réinitialiser
      if (err.name === 'NetworkError' || err.message.includes('writer')) {
        logger.warn('[SerialPortManager] write: réinitialisation du writer après erreur')
        try {
          // Note: writer n'a pas de méthode release() dans Web Serial API
        } catch (releaseErr) {
          logger.warn('[SerialPortManager] write: erreur release writer:', releaseErr)
        }
        writerRef.current = null
      }
      return false
    }
  }, [port, isConnected])

  // Nettoyer uniquement au démontage du composant (pas à chaque changement d'état)
  useEffect(() => {
    return () => {
      // Nettoyer uniquement au démontage du composant
      if (port && (port.readable || port.writable)) {
        logger.debug('[SerialPortManager] Cleanup: fermeture du port au démontage')
        disconnect().catch(err => {
          logger.warn('[SerialPortManager] Cleanup: erreur lors de la fermeture:', err)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Dépendances vides = uniquement au démontage

  return {
    port,
    isConnected,
    isSupported,
    error,
    requestPort,
    connect,
    disconnect,
    startReading,
    write
  }
}

