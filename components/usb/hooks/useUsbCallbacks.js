/**
 * Hook pour configurer les callbacks USB (envoi mesures, mise à jour dispositif)
 * Extrait de UsbStreamingTab.js pour réduire la complexité
 */

import { useEffect, useCallback } from 'react'
import logger from '@/lib/logger'

/**
 * Hook pour configurer les callbacks USB pour l'enregistrement automatique
 */
export function useUsbCallbacks({
  fetchWithAuth,
  API_URL,
  setSendMeasurementCallback,
  setUpdateDeviceFirmwareCallback,
  appendUsbStreamLog,
  refetchDevicesRef,
  notifyDevicesUpdated,
  createTimeoutWithCleanup
}) {
  // Fonction pour notifier les autres composants que les dispositifs ont changé
  const notifyDevicesUpdatedCallback = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('ott-devices-updated'))
      try {
        window.localStorage.setItem('ott-devices-last-update', Date.now().toString())
      } catch (err) {
        // Ignorer les erreurs localStorage
      }
    }
  }, [])

  // Configurer les callbacks USB
  useEffect(() => {
    if (!fetchWithAuth || !API_URL) {
      return
    }

    // Callback pour envoyer les mesures à l'API
    const sendMeasurement = async (measurementData) => {
      const apiUrl = `${API_URL}/api.php/devices/measurements`
      logger.log('🚀 [CALLBACK] sendMeasurement APPELÉ !', measurementData)
      appendUsbStreamLog(`🚀 Envoi mesure à l'API distante: ${apiUrl}`)
      appendUsbStreamLog(`📤 Données: ICCID=${measurementData.sim_iccid || 'N/A'} | Débit=${measurementData.flowrate ?? 0} L/min | Batterie=${measurementData.battery ?? 'N/A'}% | RSSI=${measurementData.rssi ?? 'N/A'}`)

      try {
        logger.log('📤 Envoi mesure USB à l\'API:', { apiUrl, measurementData })

        const response = await fetchWithAuth(
          apiUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(measurementData)
          },
          { requiresAuth: false }
        )

        appendUsbStreamLog(`📡 Réponse API: HTTP ${response.status} ${response.statusText}`)

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          const errorMsg = errorData.error || `Erreur HTTP ${response.status}`
          logger.error('❌ Réponse API erreur:', response.status, errorData)
          appendUsbStreamLog(`❌ Erreur API: ${errorMsg}`)
          throw new Error(errorMsg)
        }

        const result = await response.json()
        logger.log('✅ Mesure USB enregistrée:', result)
        appendUsbStreamLog(`✅ [BASE DE DONNÉES] Mesure enregistrée avec succès (device_id: ${result.device_id || 'N/A'})`, 'dashboard')

        // Rafraîchir les données après l'enregistrement
        createTimeoutWithCleanup(() => {
          logger.log('🔄 Rafraîchissement des dispositifs...')
          refetchDevicesRef.current()
          notifyDevicesUpdatedCallback()
        }, 500)

        return result
      } catch (err) {
        const errorMsg = err.message || 'Erreur inconnue'
        logger.error('❌ Erreur envoi mesure USB:', err)
        appendUsbStreamLog(`❌ ÉCHEC envoi mesure: ${errorMsg}`)
        throw err
      }
    }

    // Callback pour mettre à jour les informations du dispositif
    const updateDevice = async (identifier, firmwareVersion, updateData = {}) => {
      logger.log('🚀 [CALLBACK] updateDevice APPELÉ !', { identifier, firmwareVersion, updateData })
      try {
        const devicesResponse = await fetchWithAuth(
          `${API_URL}/api.php/devices`,
          { method: 'GET' },
          { requiresAuth: true }
        )

        if (!devicesResponse.ok) return

        const devicesData = await devicesResponse.json()
        const devices = devicesData.devices || []

        const device = devices.find(d => 
          d.sim_iccid === identifier || 
          d.device_serial === identifier ||
          d.device_name === identifier
        )

        // AUTO-CRÉATION: Si le dispositif n'existe pas, le créer automatiquement
        if (!device) {
          logger.log(`🆕 [AUTO-CREATE] Dispositif non trouvé (${identifier}), création automatique...`)

          const createPayload = {
            device_name: updateData.device_name || `USB-${identifier.slice(-4)}`,
            sim_iccid: updateData.sim_iccid || (identifier.startsWith('89') ? identifier : null),
            device_serial: updateData.device_serial || (!identifier.startsWith('89') ? identifier : null),
            firmware_version: firmwareVersion || null,
            status: updateData.status || 'active',
            last_seen: updateData.last_seen || new Date().toISOString()
          }

          if (updateData.last_battery !== undefined) createPayload.last_battery = updateData.last_battery
          if (updateData.last_flowrate !== undefined) createPayload.last_flowrate = updateData.last_flowrate
          if (updateData.last_rssi !== undefined) createPayload.last_rssi = updateData.last_rssi

          try {
            const createResponse = await fetchWithAuth(
              `${API_URL}/api.php/devices`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createPayload)
              },
              { requiresAuth: true }
            )

            if (createResponse.ok) {
              const result = await createResponse.json()
              logger.log('✅ [AUTO-CREATE] Dispositif créé avec succès:', result.device)
              appendUsbStreamLog(`✅ [BASE DE DONNÉES] Dispositif créé automatiquement en base (ID: ${result.device?.id || identifier})`, 'dashboard')

              createTimeoutWithCleanup(() => {
                refetchDevicesRef.current()
                notifyDevicesUpdatedCallback()
              }, 500)

              return result
            }
          } catch (createErr) {
            logger.error('❌ [AUTO-CREATE] Erreur:', createErr)
            return
          }
        }

        // MISE À JOUR: Le dispositif existe, le mettre à jour
        const updatePayload = { ...updateData }
        if (firmwareVersion && firmwareVersion !== '') {
          updatePayload.firmware_version = firmwareVersion
        }

        const response = await fetchWithAuth(
          `${API_URL}/api.php/devices/${device.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
          },
          { requiresAuth: true }
        )

        if (response.ok) {
          logger.log(`✅ [AUTO-UPDATE] Dispositif ${device.id} mis à jour`)
          const updatedFields = Object.keys(updatePayload).filter(k => updatePayload[k] !== undefined)
          if (updatedFields.length > 0) {
            appendUsbStreamLog(`✅ [BASE DE DONNÉES] Dispositif ${device.id} mis à jour (${updatedFields.join(', ')})`, 'dashboard')
          }
          createTimeoutWithCleanup(() => {
            refetchDevicesRef.current()
            notifyDevicesUpdatedCallback()
          }, 500)
        }

        return await response.json()
      } catch (err) {
        logger.error('❌ Erreur mise à jour dispositif:', err)
      }
    }

    // Configurer les callbacks UNE SEULE FOIS
    setSendMeasurementCallback(sendMeasurement)
    setUpdateDeviceFirmwareCallback(updateDevice)

    logger.debug('[USB] Callbacks configurés', { API_URL })

    // Cleanup au démontage
    return () => {
      setSendMeasurementCallback(null)
      setUpdateDeviceFirmwareCallback(null)
    }
  }, [
    fetchWithAuth,
    API_URL,
    setSendMeasurementCallback,
    setUpdateDeviceFirmwareCallback,
    appendUsbStreamLog,
    refetchDevicesRef,
    notifyDevicesUpdatedCallback,
    createTimeoutWithCleanup
  ])

  return {
    notifyDevicesUpdated: notifyDevicesUpdatedCallback
  }
}

