/**
 * Hook pour gérer le pattern de sélection de dispositif
 * Pattern dupliqué dans: UsbStreamingTab, DeviceModal, PatientModal, etc.
 */

import { useState, useCallback } from 'react'

export function useDeviceSelection(initialDevice = null) {
  const [selectedDevice, setSelectedDevice] = useState(initialDevice)
  const [selectedDeviceId, setSelectedDeviceId] = useState(initialDevice?.id || null)

  const selectDevice = useCallback((device) => {
    setSelectedDevice(device)
    setSelectedDeviceId(device?.id || null)
  }, [])

  const clearSelection = useCallback(() => {
    setSelectedDevice(null)
    setSelectedDeviceId(null)
  }, [])

  const isSelected = useCallback((deviceId) => {
    return selectedDeviceId === deviceId
  }, [selectedDeviceId])

  return {
    selectedDevice,
    selectedDeviceId,
    selectDevice,
    clearSelection,
    isSelected
  }
}

export default useDeviceSelection

