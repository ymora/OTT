/**
 * Hook pour gérer le streaming de logs USB en temps réel (local et distant)
 * Extrait de UsbStreamingTab.js pour réduire la complexité
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

/**
 * Hook pour gérer le streaming de logs USB (local et distant pour admin)
 */
export function useUsbStreaming({
  user,
  isConnected,
  usbDevice,
  usbStreamLogs = [],
  fetchWithAuth,
  API_URL
}) {
  const [remoteLogs, setRemoteLogs] = useState([])
  const [isStreamingRemote, setIsStreamingRemote] = useState(false)
  const lastLogTimestampRef = useRef(0)

  // Charger les logs distants depuis l'API
  const loadRemoteLogs = useCallback(async (deviceIdentifier, sinceTimestamp = null) => {
    if (!user || user.role_name !== 'admin' || !fetchWithAuth || !API_URL) {
      return
    }

    try {
      const url = sinceTimestamp 
        ? `/api.php/usb-logs/${encodeURIComponent(deviceIdentifier)}?limit=100&since=${sinceTimestamp}`
        : `/api.php/usb-logs/${encodeURIComponent(deviceIdentifier)}?limit=100`

      const response = await fetchJson(
        fetchWithAuth,
        API_URL,
        url,
        {},
        { requiresAuth: true }
      )

      if (response.success && response.logs) {
        const formattedLogs = response.logs.map(log => ({
          id: `remote-${log.id}`,
          line: log.log_line,
          timestamp: log.timestamp_ms || new Date(log.created_at).getTime(),
          source: log.log_source,
          isRemote: true
        }))

        if (sinceTimestamp) {
          setRemoteLogs(prev => {
            const merged = [...prev, ...formattedLogs]
            const uniqueMap = new Map()
            merged.forEach(log => uniqueMap.set(log.id, log))
            const unique = Array.from(uniqueMap.values())
            return unique.sort((a, b) => a.timestamp - b.timestamp).slice(-100)
          })
        } else {
          setRemoteLogs(formattedLogs)
        }

        if (formattedLogs.length > 0) {
          const lastTimestamp = Math.max(...formattedLogs.map(l => l.timestamp))
          lastLogTimestampRef.current = lastTimestamp
        }
      }
    } catch (err) {
      logger.error('Erreur chargement logs distants:', err)
    }
  }, [user, fetchWithAuth, API_URL])

  // Déterminer si on doit utiliser les logs distants (admin sans USB local)
  const shouldUseRemoteLogs = useMemo(() => {
    return user?.role_name === 'admin' && !isConnected && usbDevice
  }, [user, isConnected, usbDevice])

  // Fusionner les logs locaux et distants
  const allLogs = useMemo(() => {
    let logs = []

    if (usbStreamLogs.length > 0) {
      logs = usbStreamLogs
    } else if (shouldUseRemoteLogs && remoteLogs.length > 0) {
      logs = remoteLogs
    }

    // Limiter à 500 logs affichés pour éviter le blocage de l'interface
    return logs.slice(-500)
  }, [usbStreamLogs, remoteLogs, shouldUseRemoteLogs])

  // STREAMING AUTOMATIQUE en temps réel pour les admins
  useEffect(() => {
    if (!shouldUseRemoteLogs || !usbDevice) {
      setIsStreamingRemote(false)
      setRemoteLogs([])
      lastLogTimestampRef.current = 0
      return
    }

    const deviceId = usbDevice.sim_iccid || usbDevice.device_serial || usbDevice.device_name

    // Chargement initial
    setIsStreamingRemote(true)
    loadRemoteLogs(deviceId, null)

    // Polling toutes les 2 secondes pour un vrai streaming temps réel
    const interval = setInterval(() => {
      loadRemoteLogs(deviceId, lastLogTimestampRef.current)
    }, 2000)

    return () => {
      clearInterval(interval)
      setIsStreamingRemote(false)
    }
  }, [shouldUseRemoteLogs, usbDevice, loadRemoteLogs])

  return {
    allLogs,
    remoteLogs,
    isStreamingRemote,
    shouldUseRemoteLogs
  }
}

