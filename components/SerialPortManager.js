'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getUsbDeviceLabel, getUsbRequestFilters } from '@/lib/usbDevices'

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
        console.info(`[USB] Port sélectionné: ${label}`)
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
        // Port déjà ouvert, vérifier si les streams sont verrouillés
        try {
          // Vérifier si writable est locked (a déjà un writer)
          if (portToUse.writable.locked) {
            // Le stream est verrouillé, on ne peut pas créer de nouveau writer
            // Attendre un peu et réessayer, ou utiliser le writer existant
            setError('Port déjà utilisé par une autre connexion')
            return false
          }
          
          // Vérifier si readable est locked (a déjà un reader)
          if (portToUse.readable.locked) {
            // Le stream est verrouillé, on ne peut pas créer de nouveau reader
            setError('Port déjà utilisé par une autre connexion')
            return false
          }
          
          // Créer le writer (streams non verrouillés)
          const writer = portToUse.writable.getWriter()
          writerRef.current = writer

          // Créer le reader
          const reader = portToUse.readable.getReader()
          readerRef.current = reader

          setIsConnected(true)
          setPort(portToUse)
          return true
        } catch (err) {
          setError(`Erreur lors de la réutilisation du port: ${err.message}`)
          setIsConnected(false)
          return false
        }
      }
      
      // Ouvrir le port
      await portToUse.open({ baudRate })

      // Créer le writer
      const writer = portToUse.writable.getWriter()
      writerRef.current = writer

      // Créer le reader
      const reader = portToUse.readable.getReader()
      readerRef.current = reader

      setIsConnected(true)
      setPort(portToUse)
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
    try {
      if (readerRef.current) {
        await readerRef.current.cancel()
        await readerRef.current.release()
        readerRef.current = null
      }

      if (writerRef.current) {
        await writerRef.current.release()
        writerRef.current = null
      }

      if (port) {
        await port.close()
      }

      setIsConnected(false)
      setPort(null)
      setError(null)
    } catch (err) {
      setError(`Erreur de déconnexion: ${err.message}`)
    }
  }, [port])

  // Démarrer la lecture en continu
  const startReading = useCallback(async (onData) => {
    if (!isConnected) {
      console.error('[SerialPortManager] startReading: Port non connecté')
      return () => {}
    }

    if (!readerRef.current) {
      console.error('[SerialPortManager] startReading: Reader non disponible')
      setError('Reader non disponible. Le port doit être connecté avant de démarrer la lecture.')
      return () => {}
    }

    let reading = true
    let readLoopActive = true
    
    const readLoop = async () => {
      try {
        console.log('[SerialPortManager] Démarrage de la boucle de lecture...')
        while (reading && readLoopActive) {
          // Vérifier que le reader existe toujours
          if (!readerRef.current) {
            console.warn('[SerialPortManager] Reader perdu, arrêt de la lecture')
            break
          }

          try {
            const { value, done } = await readerRef.current.read()
            
            if (done) {
              console.log('[SerialPortManager] Stream terminé (done=true)')
              break
            }
            
            if (value && onData) {
              // Convertir Uint8Array en string
              const text = new TextDecoder().decode(value)
              if (text && text.length > 0) {
                console.log(`[SerialPortManager] Données reçues: ${text.length} caractères`)
                onData(text)
              }
            }
          } catch (readErr) {
            // Erreur lors de la lecture d'un chunk
            if (readErr.name === 'NetworkError') {
              // Erreur réseau normale (déconnexion)
              console.log('[SerialPortManager] Erreur réseau (déconnexion probable)')
              break
            } else if (readErr.name === 'TypeError' && readErr.message.includes('cancel')) {
              // Lecture annulée explicitement
              console.log('[SerialPortManager] Lecture annulée')
              break
            } else {
              console.error('[SerialPortManager] Erreur lors de la lecture:', readErr)
              // Continuer la lecture malgré l'erreur
            }
          }
        }
        console.log('[SerialPortManager] Boucle de lecture terminée')
      } catch (err) {
        console.error('[SerialPortManager] Erreur dans la boucle de lecture:', err)
        if (err.name !== 'NetworkError' && reading) {
          setError(`Erreur de lecture: ${err.message}`)
        }
      } finally {
        readLoopActive = false
      }
    }

    // Démarrer la boucle de lecture (ne pas await pour ne pas bloquer)
    readLoop().catch(err => {
      console.error('[SerialPortManager] Erreur non gérée dans readLoop:', err)
      readLoopActive = false
    })
    
    // Retourner une fonction pour arrêter la lecture
    return () => {
      console.log('[SerialPortManager] Arrêt de la lecture demandé')
      reading = false
      readLoopActive = false
      // Ne pas annuler le reader ici car il peut être utilisé ailleurs
    }
  }, [isConnected, setError])

  // Écrire des données
  const write = useCallback(async (data) => {
    if (!writerRef.current || !isConnected) {
      setError('Port non connecté')
      return false
    }

    try {
      const encoder = new TextEncoder()
      const dataArray = encoder.encode(data)
      await writerRef.current.write(dataArray)
      return true
    } catch (err) {
      setError(`Erreur d'écriture: ${err.message}`)
      return false
    }
  }, [isConnected])

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

