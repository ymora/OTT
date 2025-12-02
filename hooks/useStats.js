/**
 * Hook pour calculer les statistiques du dashboard
 * Centralise le calcul des stats pour éviter les duplications
 */

import { useMemo } from 'react'

/**
 * Calcule les statistiques à partir des données
 * @param {Object} data - Données brutes
 * @param {Object} usbContext - Contexte USB (optionnel)
 * @returns {Object} Statistiques calculées
 */
export function useStats(data = {}, usbContext = {}) {
  const {
    devices = [],
    users = [],
    patients = [],
    alerts = [],
    firmwares = [],
    auditLogs = []
  } = data

  const { isConnected, usbDeviceInfo } = usbContext

  return useMemo(() => {
    // Alertes non résolues
    const unresolvedAlerts = alerts.filter(a => a.status === 'unresolved')

    // Dispositifs en ligne depuis la base de données (last_seen < 2h)
    const onlineFromDb = devices.filter(d => {
      if (!d.last_seen) return false
      const lastSeen = new Date(d.last_seen)
      if (isNaN(lastSeen.getTime())) return false
      const hoursSince = (new Date() - lastSeen) / (1000 * 60 * 60)
      return hoursSince < 2
    })

    // Vérifier si un dispositif USB est connecté et n'est pas déjà compté
    const usbDeviceOnline = isConnected && usbDeviceInfo && (
      usbDeviceInfo.sim_iccid || usbDeviceInfo.device_serial
    )

    let usbDeviceAlreadyCounted = false
    if (usbDeviceOnline) {
      usbDeviceAlreadyCounted = onlineFromDb.some(d =>
        (usbDeviceInfo.sim_iccid && d.sim_iccid === usbDeviceInfo.sim_iccid) ||
        (usbDeviceInfo.device_serial && d.device_serial === usbDeviceInfo.device_serial)
      )
    }

    const activeDevices = onlineFromDb.length + (usbDeviceOnline && !usbDeviceAlreadyCounted ? 1 : 0)

    // Batteries faibles (< 30%)
    const lowBatteryDevices = devices.filter(d => {
      const battery = d.last_battery
      return battery !== null && battery !== undefined && battery < 30
    })

    // Alertes critiques
    const criticalAlerts = unresolvedAlerts.filter(a => a.severity === 'critical').length

    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.is_active).length,
      totalDevices: devices.length,
      activeDevices,
      totalPatients: patients.length,
      totalAlerts: alerts.length,
      unresolvedAlerts: unresolvedAlerts.length,
      criticalAlerts,
      lowBatteryDevices: lowBatteryDevices.length,
      totalFirmwares: firmwares.length,
      totalAuditLogs: auditLogs.length
    }
  }, [devices, users, patients, alerts, firmwares, auditLogs, isConnected, usbDeviceInfo])
}

