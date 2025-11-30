'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getUsbDeviceLabel, getUsbRequestFilters } from '@/lib/usbDevices'
import logger from '@/lib/logger'

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

  // Vérifier le support de Web Serial API
  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator

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

    try {
      setError(null)
      
      // Libérer les anciens writers/readers s'ils existent
      if (writerRef.current) {
        try {
          await writerRef.current.release()
        } catch (e) {
          // Ignorer les erreurs de release (déjà libéré)
        }
        writerRef.current = null
      }
      
      if (readerRef.current) {
        try {
          await readerRef.current.cancel()
          await readerRef.current.release()
        } catch (e) {
          // Ignorer les erreurs de release (déjà libéré)
        }
        readerRef.current = null
      }
      
      // Vérifier si le port est déjà ouvert
      // Si readable et writable existent, le port est déjà ouvert
      if (portToUse.readable && portToUse.writable) {
        logger.debug('[SerialPortManager] connect: port déjà ouvert, vérification des locks...')
        logger.debug('[SerialPortManager] connect: writable.locked =', portToUse.writable.locked)
        logger.debug('[SerialPortManager] connect: readable.locked =', portToUse.readable.locked)
        
        // Si les streams sont verrouillés, on ne peut pas les réutiliser
        // Il faut fermer complètement le port et le rouvrir
        if (portToUse.writable.locked || portToUse.readable.locked) {
          logger.warn('[SerialPortManager] connect: port verrouillé, fermeture complète nécessaire...')
          try {
            // Libérer les refs d'abord
            if (writerRef.current) {
              try {
                await writerRef.current.release()
              } catch (e) {
                logger.warn('[SerialPortManager] connect: erreur release writer:', e)
              }
              writerRef.current = null
            }
            
            if (readerRef.current) {
              try {
                await readerRef.current.cancel()
                await readerRef.current.release()
              } catch (e) {
                logger.warn('[SerialPortManager] connect: erreur release reader:', e)
              }
              readerRef.current = null
            }
            
            // Fermer complètement le port
            logger.debug('[SerialPortManager] connect: fermeture du port pour le rouvrir...')
            try {
              await portToUse.close()
              logger.debug('[SerialPortManager] connect: port fermé, attente 500ms...')
              // Attendre que le port soit complètement fermé
              await new Promise(resolve => setTimeout(resolve, 500))
            } catch (closeErr) {
              logger.warn('[SerialPortManager] connect: erreur fermeture port:', closeErr)
              // Continuer quand même, peut-être que le port est déjà fermé
            }
            
            // Maintenant rouvrir le port (on va continuer après le if)
            logger.debug('[SerialPortManager] connect: port sera rouvert après la fermeture')
          } catch (cleanupErr) {
            logger.error('[SerialPortManager] connect: erreur nettoyage:', cleanupErr)
            setError(`Erreur lors du nettoyage du port: ${cleanupErr.message}`)
            return false
          }
        } else {
          // Port ouvert et non verrouillé, on peut réutiliser
          logger.debug('[SerialPortManager] connect: port non verrouillé, réutilisation...')
          try {
            // Créer le writer (streams non verrouillés)
            logger.debug('[SerialPortManager] connect: création du writer...')
            const writer = portToUse.writable.getWriter()
            writerRef.current = writer

            // Créer le reader
            logger.debug('[SerialPortManager] connect: création du reader...')
            const reader = portToUse.readable.getReader()
            readerRef.current = reader

            setIsConnected(true)
            setPort(portToUse)
            logger.debug('[SerialPortManager] connect: ✅ port réutilisé avec succès')
            return true
          } catch (err) {
            logger.error('[SerialPortManager] connect: erreur réutilisation port:', err)
            setError(`Erreur lors de la réutilisation du port: ${err.message}`)
            setIsConnected(false)
            return false
          }
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
        try {
          await readerRef.current.release()
        } catch (releaseErr) {
          logger.warn('[SerialPortManager] disconnect: erreur release reader:', releaseErr)
        }
        readerRef.current = null
        logger.debug('[SerialPortManager] disconnect: reader libéré')
      }

      // Libérer le writer
      if (writerRef.current) {
        logger.debug('[SerialPortManager] disconnect: libération du writer...')
        try {
          await writerRef.current.release()
        } catch (releaseErr) {
          logger.warn('[SerialPortManager] disconnect: erreur release writer:', releaseErr)
        }
        writerRef.current = null
        logger.debug('[SerialPortManager] disconnect: writer libéré')
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
      logger.debug('[SerialPortManager] disconnect: ✅ déconnexion complète')
    } catch (err) {
      logger.error('[SerialPortManager] disconnect: ❌ erreur:', err)
      setError(`Erreur de déconnexion: ${err.message}`)
    }
  }, [port])

  // Démarrer la lecture en continu
  const startReading = useCallback(async (onData) => {
    // Vérifier directement le port au lieu de compter sur isConnected qui peut avoir un délai
    const portIsAvailable = port && port.readable && port.writable
    const readerIsAvailable = readerRef.current
    
    logger.debug('[SerialPortManager] startReading: vérifications...')
    logger.debug('[SerialPortManager] startReading: isConnected =', isConnected)
    logger.debug('[SerialPortManager] startReading: port existe =', !!port)
    logger.debug('[SerialPortManager] startReading: port.readable =', !!port?.readable)
    logger.debug('[SerialPortManager] startReading: port.writable =', !!port?.writable)
    logger.debug('[SerialPortManager] startReading: readerRef.current =', !!readerRef.current)
    
    if (!portIsAvailable && !readerIsAvailable) {
      logger.error('[SerialPortManager] startReading: Port non disponible (port:', !!port, 'readable:', !!port?.readable, 'writable:', !!port?.writable, 'reader:', !!readerRef.current, ')')
      setError('Port non disponible. Le port doit être connecté avant de démarrer la lecture.')
      return () => {}
    }

    // Si le reader n'existe pas mais le port est disponible, créer le reader
    if (!readerRef.current && portIsAvailable) {
      logger.debug('[SerialPortManager] startReading: création du reader...')
      try {
        if (port.readable.locked) {
          logger.error('[SerialPortManager] startReading: readable est verrouillé')
          setError('Port readable verrouillé. Déconnectez et reconnectez.')
          return () => {}
        }
        readerRef.current = port.readable.getReader()
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
        logger.debug('[SerialPortManager] Démarrage de la boucle de lecture...')
        while (reading && readLoopActive) {
          // Vérifier que le reader existe toujours
          if (!readerRef.current) {
            logger.warn('[SerialPortManager] Reader perdu, arrêt de la lecture')
            break
          }

          try {
            const { value, done } = await readerRef.current.read()
            
            // Réinitialiser le compteur d'erreurs en cas de succès
            consecutiveErrors = 0
            
            if (done) {
              logger.debug('[SerialPortManager] Stream terminé (done=true)')
              break
            }
            
            if (value && onData) {
              // Convertir Uint8Array en string
              const text = new TextDecoder().decode(value)
              if (text && text.length > 0) {
                logger.debug(`[SerialPortManager] Données reçues: ${text.length} caractères`)
                onData(text)
              }
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
              consecutiveErrors++
              if (consecutiveErrors <= 3) {
                // Ignorer les premières erreurs de framing (souvent temporaires)
                logger.debug(`[SerialPortManager] Erreur de framing ignorée (${consecutiveErrors}/3)`)
                await new Promise(resolve => setTimeout(resolve, 50))
                continue
              } else if (consecutiveErrors === 4) {
                // Logger une seule fois après les 3 premières
                logger.warn(`[SerialPortManager] Erreurs de framing détectées (continuation silencieuse...)`)
                await new Promise(resolve => setTimeout(resolve, 100))
                continue
              } else if (consecutiveErrors % 100 === 0) {
                // Logger seulement toutes les 100 erreurs pour éviter le spam
                logger.debug(`[SerialPortManager] ${consecutiveErrors} erreurs de framing (continuation...)`)
                await new Promise(resolve => setTimeout(resolve, 100))
                continue
              } else {
                // Continuer silencieusement
                await new Promise(resolve => setTimeout(resolve, 100))
                continue
              }
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
          await writerRef.current.release()
        } catch (releaseErr) {
          logger.warn('[SerialPortManager] write: erreur release writer:', releaseErr)
        }
        writerRef.current = null
      }
      return false
    }
  }, [port, isConnected])

  // Nettoyer à la déconnexion
  useEffect(() => {
    return () => {
      if (isConnected) {
        disconnect()
      }
    }
  }, [isConnected, disconnect])

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

