'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

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
      const selectedPort = await navigator.serial.requestPort()
      setPort(selectedPort)
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
    if (!readerRef.current || !isConnected) {
      return () => {}
    }

    let reading = true
    const readLoop = async () => {
      try {
        while (reading && readerRef.current && isConnected) {
          const { value, done } = await readerRef.current.read()
          if (done) break
          if (value && onData) {
            // Convertir Uint8Array en string
            const text = new TextDecoder().decode(value)
            onData(text)
          }
        }
      } catch (err) {
        if (err.name !== 'NetworkError' && reading) {
          setError(`Erreur de lecture: ${err.message}`)
        }
      }
    }

    readLoop()
    
    // Retourner une fonction pour arrêter la lecture
    return () => {
      reading = false
    }
  }, [isConnected])

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

