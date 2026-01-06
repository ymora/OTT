/**
 * Hook USB simplifié et factorisé
 * Remplace toute la logique complexe par une approche simple qui fonctionne
 */

import { useState, useCallback, useRef, useEffect } from 'react'

export function useSimpleUsbStreaming() {
  const [isConnected, setIsConnected] = useState(false)
  const [logs, setLogs] = useState([])
  const [port, setPort] = useState(null)
  const [isSimpleMode, setIsSimpleMode] = useState(false)
  
  const readerRef = useRef(null)
  const writerRef = useRef(null)

  // Ajouter un log
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString()
    const logEntry = `[${timestamp}] ${message}`
    console.log(logEntry)
    setLogs(prev => [...prev, { message: logEntry, type, timestamp: Date.now() }])
  }, [])

  // Mode simple : connexion directe comme la page de test
  const connectSimple = useCallback(async () => {
    if (!('serial' in navigator)) {
      addLog('Web Serial API non supportée. Utilisez Chrome ou Edge.', 'error')
      return false
    }

    try {
      addLog('🔍 Demande d\'accès au port série (Mode Simple)...', 'info')
      const selectedPort = await navigator.serial.requestPort()
      
      if (!selectedPort) {
        addLog('Aucun port sélectionné.', 'error')
        return false
      }

      addLog('Connexion au port à 115200 bauds...', 'info')
      await selectedPort.open({ baudRate: 115200 })

      const reader = selectedPort.readable.getReader()
      const writer = selectedPort.writable.getWriter()

      setPort(selectedPort)
      readerRef.current = reader
      writerRef.current = writer
      setIsConnected(true)

      addLog('✅ Connecté avec succès (Mode Simple)!', 'success')

      // Démarrer la lecture
      const readLoop = async () => {
        try {
          while (true) {
            const { value, done } = await reader.read()
            if (done) {
              addLog('Fin de la lecture du port', 'info')
              break
            }
            
            const text = new TextDecoder().decode(value)
            addLog(text, 'device')
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
      addLog(`❌ Erreur de connexion (Mode Simple): ${error.message}`, 'error')
      return false
    }
  }, [addLog])

  // Se déconnecter
  const disconnect = useCallback(async () => {
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
    } catch (error) {
      addLog(`Erreur de déconnexion: ${error.message}`, 'error')
    }
  }, [port, addLog])

  // Vider les logs
  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  // Basculer entre modes
  const toggleMode = useCallback(() => {
    setIsSimpleMode(prev => !prev)
  }, [])

  return {
    // État
    isConnected,
    logs,
    isSimpleMode,
    
    // Actions
    connect: isSimpleMode ? connectSimple : () => addLog('Mode normal non implémenté', 'warning'),
    disconnect,
    clearLogs,
    toggleMode,
    
    // Utilitaires
    addLog
  }
}
