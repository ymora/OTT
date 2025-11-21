'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { useSerialPort } from '@/components/SerialPortManager'
import logger from '@/lib/logger'

const UsbContext = createContext()

export function UsbProvider({ children }) {
  const { port, isConnected, isSupported, requestPort, connect, disconnect, startReading, write } = useSerialPort()
  
  // État USB global
  const [usbConnectedDevice, setUsbConnectedDevice] = useState(null)
  const [usbVirtualDevice, setUsbVirtualDevice] = useState(null)
  const [usbPortInfo, setUsbPortInfo] = useState(null)
  const [autoDetecting, setAutoDetecting] = useState(true)
  const [checkingUSB, setCheckingUSB] = useState(false)
  
  // État streaming USB
  const [usbStreamStatus, setUsbStreamStatus] = useState('idle')
  const [usbStreamMeasurements, setUsbStreamMeasurements] = useState([])
  const [usbStreamLogs, setUsbStreamLogs] = useState([])
  const [usbStreamError, setUsbStreamError] = useState(null)
  const [usbStreamLastMeasurement, setUsbStreamLastMeasurement] = useState(null)
  const [usbStreamLastUpdate, setUsbStreamLastUpdate] = useState(null)
  
  const usbStreamStopRef = useRef(null)
  const usbStreamBufferRef = useRef('')
  const sendMeasurementToApiRef = useRef(null) // Callback pour envoyer les mesures à l'API

  // Fonction pour ajouter un log USB
  const appendUsbStreamLog = useCallback((line) => {
    if (!line) return
    setUsbStreamLogs(prev => {
      const next = [...prev, { id: `${Date.now()}-${Math.random()}`, line, timestamp: Date.now() }]
      return next.slice(-80)
    })
  }, [])

  // Fonction pour préparer le port
  const ensurePortReady = useCallback(async () => {
    if (!isSupported) {
      throw new Error('Web Serial API non supportée par ce navigateur')
    }

    if (port && isConnected) return port

    if (port && !isConnected) {
      const reconnected = await connect(port, 115200)
      if (reconnected) return port
    }

    const selectedPort = await requestPort()
    if (!selectedPort) {
      throw new Error('Aucun port USB sélectionné')
    }

    const connected = await connect(selectedPort, 115200)
    if (!connected) {
      throw new Error('Impossible de se connecter au port USB sélectionné')
    }

    return selectedPort
  }, [connect, isConnected, isSupported, port, requestPort])

  // Fonction pour envoyer une mesure à l'API
  const sendMeasurementToApi = useCallback(async (measurement, device) => {
    if (!device || !sendMeasurementToApiRef.current) return
    
    try {
      const simIccid = device.sim_iccid || device.device_serial || device.device_name
      if (!simIccid) {
        logger.warn('Impossible d\'envoyer la mesure USB: pas d\'ICCID disponible')
        return
      }

      const measurementData = {
        sim_iccid: simIccid,
        flowrate: measurement.flowrate ?? 0,
        battery: measurement.battery ?? null,
        rssi: measurement.rssi ?? null,
        firmware_version: device.firmware_version || measurement.raw?.firmware_version || null,
        timestamp: new Date(measurement.timestamp).toISOString(),
        status: 'USB'
      }

      await sendMeasurementToApiRef.current(measurementData)
      logger.debug('✅ Mesure USB envoyée à l\'API:', measurementData)
    } catch (err) {
      logger.error('Erreur envoi mesure USB à l\'API:', err)
    }
  }, [])

  // Traitement des lignes de streaming USB
  const processUsbStreamLine = useCallback((line) => {
    if (!line) return
    const trimmed = line.trim()
    if (!trimmed) return

    // Toujours ajouter les logs
    appendUsbStreamLog(trimmed)

    if (trimmed.startsWith('{') && trimmed.includes('"mode"')) {
      try {
        const payload = JSON.parse(trimmed)
        if (payload.mode === 'usb_stream') {
          const measurement = {
            id: `usb-${payload.seq ?? Date.now()}`,
            seq: payload.seq ?? null,
            timestamp: Date.now(),
            flowrate: payload.flow_lpm ?? payload.flowrate ?? payload.flow ?? null,
            battery: payload.battery_percent ?? payload.battery ?? null,
            rssi: payload.rssi ?? null,
            interval: payload.interval_ms ?? payload.interval ?? null,
            raw: payload,
          }

          setUsbStreamMeasurements(prev => {
            const next = [...prev, measurement]
            return next.slice(-120)
          })
          setUsbStreamLastMeasurement(measurement)
          setUsbStreamLastUpdate(Date.now())
          setUsbStreamError(null)
          setUsbStreamStatus('running')
          
          // Envoyer la mesure à l'API si un dispositif USB est connecté
          const currentDevice = usbConnectedDevice || usbVirtualDevice
          if (currentDevice) {
            sendMeasurementToApi(measurement, currentDevice)
          }
          
          return
        }
      } catch (err) {
        logger.debug('JSON invalide:', trimmed)
        return
      }
    }
  }, [appendUsbStreamLog, sendMeasurementToApi, usbConnectedDevice, usbVirtualDevice])

  // Gestion des chunks de streaming
  const handleUsbStreamChunk = useCallback((chunk) => {
    if (!chunk) return
    
    logger.debug('📥 Chunk reçu:', chunk.length, 'caractères')
    
    usbStreamBufferRef.current += chunk
    const parts = usbStreamBufferRef.current.split(/\r?\n/)
    usbStreamBufferRef.current = parts.pop() ?? ''
    
    parts.forEach(line => {
      if (line || line === '') {
        processUsbStreamLine(line)
      }
    })
    
    if (usbStreamStatus === 'waiting') {
      setUsbStreamStatus('running')
    }
  }, [processUsbStreamLine, usbStreamStatus])

  // Démarrer le streaming USB
  const startUsbStreaming = useCallback(async () => {
    try {
      setUsbStreamError(null)
      setUsbStreamStatus('connecting')
      await ensurePortReady()

      if (usbStreamStopRef.current) {
        usbStreamStopRef.current()
        usbStreamStopRef.current = null
      }

      usbStreamBufferRef.current = ''
      setUsbStreamMeasurements([])
      setUsbStreamLogs([])
      setUsbStreamLastMeasurement(null)
      setUsbStreamLastUpdate(null)

      const stop = await startReading(handleUsbStreamChunk)
      usbStreamStopRef.current = stop
      setUsbStreamStatus('waiting')
    } catch (err) {
      setUsbStreamError(err.message || 'Impossible de démarrer le streaming USB')
      setUsbStreamStatus('idle')
    }
  }, [ensurePortReady, handleUsbStreamChunk, startReading])

  // Arrêter le streaming USB
  const stopUsbStreaming = useCallback(() => {
    if (usbStreamStopRef.current) {
      usbStreamStopRef.current()
      usbStreamStopRef.current = null
    }
    setUsbStreamStatus('idle')
  }, [])

  // Détecter un dispositif USB (fonction simplifiée - à compléter avec la logique de détection)
  const detectUSBDevice = useCallback(async (devices = [], fetchWithAuth, API_URL, refetch, notifyDevicesUpdated) => {
    if (!isSupported) {
      logger.warn('Web Serial API non supporté')
      return null
    }

    setCheckingUSB(true)
    try {
      // Logique de détection à implémenter ici
      // Pour l'instant, retourner null
      return null
    } catch (err) {
      logger.error('Erreur détection USB:', err)
      return null
    } finally {
      setCheckingUSB(false)
    }
  }, [isSupported])

  // Détection automatique en permanence
  useEffect(() => {
    if (!isSupported) {
      setAutoDetecting(false)
      return
    }

    if (!autoDetecting) return

    // Détection automatique périodique
    const interval = setInterval(async () => {
      try {
        const ports = await navigator.serial.getPorts()
        if (ports.length > 0 && !usbConnectedDevice && !usbVirtualDevice) {
          logger.debug('🔍 Détection automatique USB...')
          // La détection complète sera gérée par les pages qui utilisent le contexte
        }
      } catch (err) {
        logger.debug('Erreur détection auto:', err)
      }
    }, 5000) // Vérifier toutes les 5 secondes

    return () => clearInterval(interval)
  }, [isSupported, autoDetecting, usbConnectedDevice, usbVirtualDevice])

  // Nettoyer à la déconnexion
  useEffect(() => {
    return () => {
      stopUsbStreaming()
    }
  }, [stopUsbStreaming])

  // Fonction pour configurer le callback d'envoi des mesures à l'API
  const setSendMeasurementCallback = useCallback((callback) => {
    sendMeasurementToApiRef.current = callback
  }, [])

  const value = {
    // État USB
    usbConnectedDevice,
    setUsbConnectedDevice,
    usbVirtualDevice,
    setUsbVirtualDevice,
    usbPortInfo,
    setUsbPortInfo,
    autoDetecting,
    setAutoDetecting,
    checkingUSB,
    setCheckingUSB,
    isConnected,
    isSupported,
    port,
    
    // Streaming USB
    usbStreamStatus,
    usbStreamMeasurements,
    usbStreamLogs,
    usbStreamError,
    usbStreamLastMeasurement,
    usbStreamLastUpdate,
    startUsbStreaming,
    stopUsbStreaming,
    
    // Fonctions
    detectUSBDevice,
    ensurePortReady,
    requestPort,
    connect,
    disconnect,
    startReading,
    write,
    setSendMeasurementCallback,
  }

  return (
    <UsbContext.Provider value={value}>
      {children}
    </UsbContext.Provider>
  )
}

export function useUsb() {
  const context = useContext(UsbContext)
  if (!context) {
    throw new Error('useUsb must be used within UsbProvider')
  }
  return context
}

