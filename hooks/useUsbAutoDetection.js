'use client'

import { useEffect, useRef } from 'react'
import logger from '@/lib/logger'

/**
 * Hook pour activer la détection automatique USB
 * Utilisé par les pages qui ont besoin de détecter les dispositifs USB
 */
export function useUsbAutoDetection(isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice) {
  useEffect(() => {
    if (!isSupported) {
      setAutoDetecting(false)
      return
    }

    // Si un dispositif USB est déjà connecté, pas besoin de détecter
    if (usbConnectedDevice || usbVirtualDevice) {
      return
    }

    // Activer la détection automatique pour que le contexte USB puisse détecter
    // La détection complète se fait dans devices/page.js via detectDeviceOnPort
    if (!autoDetecting) {
      setAutoDetecting(true)
      logger.log('🔄 Activation de la détection automatique USB')
    }
  }, [isSupported, autoDetecting, setAutoDetecting, usbConnectedDevice, usbVirtualDevice])
}

