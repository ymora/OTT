/**
 * Hook pour gérer la synchronisation du dispositif USB avec la base de données
 * Extrait de UsbStreamingTab.js pour réduire la complexité
 */

import { useEffect, useRef, useMemo } from 'react'

/**
 * Hook pour synchroniser le dispositif USB connecté avec la base de données
 * Crée un dispositif virtuel si nécessaire, ou associe au dispositif existant
 */
export function useDeviceRegistration({
  isConnected,
  usbDeviceInfo,
  usbDevice,
  setUsbDevice,
  allDevices,
  isUsbDeviceRegistered,
  normalizeId,
  invalidateCache,
  refetchDevicesRef
}) {
  const wasConnectedRef = useRef(false)
  const allDevicesRef = useRef([])
  const usbDeviceRef = useRef(null)

  // Mettre à jour les références à chaque changement
  useEffect(() => {
    allDevicesRef.current = allDevices
  }, [allDevices])

  useEffect(() => {
    usbDeviceRef.current = usbDevice
  }, [usbDevice])

  // Mémoriser les identifiants USB pour éviter les re-renders inutiles
  const usbIdentifiers = useMemo(() => ({
    iccid: normalizeId(usbDeviceInfo?.sim_iccid),
    serial: normalizeId(usbDeviceInfo?.device_serial),
    name: usbDeviceInfo?.device_name,
    firmware: usbDeviceInfo?.firmware_version
  }), [
    usbDeviceInfo?.sim_iccid,
    usbDeviceInfo?.device_serial,
    usbDeviceInfo?.device_name,
    usbDeviceInfo?.firmware_version,
    normalizeId
  ])

  // Synchronisation simple du dispositif USB avec la base
  useEffect(() => {
    if (!isConnected) {
      wasConnectedRef.current = false
      return
    }

    // Rafraîchir la liste à la première connexion
    if (!wasConnectedRef.current) {
      wasConnectedRef.current = true
      invalidateCache()
      setTimeout(() => refetchDevicesRef.current(), 200)
    }

    // Si on a des identifiants, chercher en base
    const normalizedIccid = usbIdentifiers.iccid
    const normalizedSerial = usbIdentifiers.serial

    if (normalizedIccid || normalizedSerial) {
      const existingDevice = allDevicesRef.current.find(d => {
        const dbIccid = normalizeId(d.sim_iccid)
        const dbSerial = normalizeId(d.device_serial)
        return (normalizedIccid && dbIccid && normalizedIccid === dbIccid) ||
               (normalizedSerial && dbSerial && normalizedSerial === dbSerial)
      })

      if (existingDevice && (!usbDeviceRef.current || usbDeviceRef.current.id !== existingDevice.id)) {
        setUsbDevice({ ...existingDevice, isVirtual: false })
        return
      }
    }

    // Créer un dispositif virtuel si pas trouvé en base
    if (!usbDeviceRef.current || usbDeviceRef.current.id?.startsWith('usb_virtual')) {
      // Attendre d'avoir au moins un identifiant (ICCID ou Serial) avant de créer le dispositif
      if (!normalizedIccid && !normalizedSerial) {
        return
      }

      // On a l'ICCID ou le Serial, créer le dispositif
      const deviceName = usbDeviceInfo?.device_name || 
        (usbIdentifiers.iccid ? `USB-${usbIdentifiers.iccid.slice(-4)}` : 
         usbIdentifiers.serial ? `USB-${usbIdentifiers.serial.slice(-4)}` : 
         'USB-????')

      const newDevice = {
        id: `usb_virtual_${Date.now()}`,
        device_name: deviceName,
        sim_iccid: usbDeviceInfo?.sim_iccid || null,
        device_serial: usbDeviceInfo?.device_serial || null,
        firmware_version: usbDeviceInfo?.firmware_version || null,
        status: 'active',
        last_seen: new Date().toISOString(),
        isVirtual: true
      }

      if (!usbDeviceRef.current || 
          usbDeviceRef.current.sim_iccid !== newDevice.sim_iccid ||
          usbDeviceRef.current.device_serial !== newDevice.device_serial) {
        setUsbDevice(newDevice)
      }
    }
  }, [isConnected, usbIdentifiers, invalidateCache, normalizeId, setUsbDevice])

  return {
    usbIdentifiers
  }
}

