/**
 * Composant de connexion USB simplifié pour contourner les problèmes Web Serial API
 * Utilise la même approche que la page de test qui fonctionne
 */

import { useState, useCallback, useRef } from 'react'

export default function SimpleUsbConnector({ onConnect, onDisconnect, onData }) {
  const [isConnected, setIsConnected] = useState(false)
  const [logs, setLogs] = useState([])
  const [port, setPort] = useState(null)
  const readerRef = useRef(null)
  const writerRef = useRef(null)

  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = `[${timestamp}] ${message}`
    console.log(logEntry)
    setLogs(prev => [...prev, { message: logEntry, type, timestamp: Date.now() }])
  }, [])

  const connectDirect = useCallback(async () => {
    if (!('serial' in navigator)) {
      addLog('Web Serial API non supportée. Utilisez Chrome ou Edge.', 'error')
      return false
    }

    try {
      addLog('Demande d\'accès aux ports série...', 'info')
      
      // Essayer de demander un nouveau port (comme dans ma page de test)
      const selectedPort = await navigator.serial.requestPort()
      
      if (!selectedPort) {
        addLog('Aucun port sélectionné.', 'error')
        return false
      }

      addLog('Connexion au port à 115200 bauds...', 'info')
      await selectedPort.open({ baudRate: 115200 })

      // Créer reader et writer
      const reader = selectedPort.readable.getReader()
      const writer = selectedPort.writable.getWriter()

      setPort(selectedPort)
      readerRef.current = reader
      writerRef.current = writer
      setIsConnected(true)

      addLog('✅ Connecté avec succès!', 'success')
      
      // Notifier le composant parent
      if (onConnect) {
        onConnect(selectedPort, reader, writer)
      }

      // Démarrer la lecture
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) {
              addLog('Fin de la lecture du port', 'info')
              break
            }
            
            // Convertir les bytes en texte
            const text = new TextDecoder().decode(value)
            
            // Notifier le composant parent
            if (onData) {
              onData(text)
            }
          }
        } catch (error) {
          if (error.name !== 'NetworkError') {
            addLog(`Erreur de lecture: ${error.message}`, 'error')
          }
        }
      }
      
      readLoop()
      return true

    } catch (error) {
      addLog(`❌ Erreur de connexion: ${error.message}`, 'error')
      console.error('Erreur:', error)
      return false
    }
  }, [onConnect, onData, addLog])

  const disconnectDirect = useCallback(async () => {
    try {
      if (readerRef.current) {
        await readerRef.current.cancel()
        readerRef.current = null
      }
      if (writerRef.current) {
        writerRef.current = null
      }
      if (port) {
        await port.close()
        setPort(null)
      }
      setIsConnected(false)
      addLog('🔌 Déconnecté', 'info')
      
      // Notifier le composant parent
      if (onDisconnect) {
        onDisconnect()
      }
    } catch (error) {
      addLog(`Erreur de déconnexion: ${error.message}`, 'error')
    }
  }, [port, onDisconnect, addLog])

  return {
    isConnected,
    logs,
    connectDirect,
    disconnectDirect
  }
}
