/**
 * Utilitaires pour la création de commandes OTA pour les dispositifs
 * Centralise la logique de construction des payloads pour éviter les doublons
 */

import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'
import { DEVICE_DEFAULTS } from '@/lib/deviceDefaults'

/**
 * Construit le payload pour la commande UPDATE_CONFIG
 * @param {Object} config - Configuration avec les paramètres à mettre à jour
 * @param {boolean} includeDefaults - Si true, inclure les valeurs par défaut pour les champs non fournis (pour USB)
 * @returns {Object} Payload pour UPDATE_CONFIG
 */
export function buildUpdateConfigPayload(config, includeDefaults = false) {
  const payload = {}
  
  const addString = (key, value, defaultValue = null) => {
    if (includeDefaults && defaultValue !== null && (value === undefined || value === null || value === '')) {
      payload[key] = defaultValue
    } else {
      const trimmed = (value ?? '').trim()
      if (trimmed) {
        payload[key] = trimmed
      }
    }
  }
  
  const addNumber = (key, value, defaultValue = null) => {
    if (includeDefaults && defaultValue !== null && (value === undefined || value === null || value === '')) {
      payload[key] = defaultValue
    } else if (value !== '' && value !== null && value !== undefined) {
      const num = Number(value)
      if (Number.isFinite(num)) {
        payload[key] = num
      }
    }
  }
  
  // Paramètres réseau
  addString('apn', config.apn, includeDefaults ? DEVICE_DEFAULTS.apn : null)
  // Utiliser l'opérateur explicitement sélectionné, ou sim_operator seulement si operator n'est pas défini
  // Ne pas utiliser sim_operator si operator est une chaîne vide (cela signifie "automatique")
  if (config.operator !== undefined && config.operator !== null && config.operator !== '') {
    addString('operator', config.operator)
  } else if (config.sim_operator !== undefined && config.sim_operator !== null && config.sim_operator !== '') {
    addString('operator', config.sim_operator)
  } else if (includeDefaults && DEVICE_DEFAULTS.operator) {
    addString('operator', DEVICE_DEFAULTS.operator)
  }
  addString('jwt', config.jwt)
  addString('iccid', config.iccid)
  addString('serial', config.serial)
  addString('sim_pin', config.simPin || config.sim_pin, includeDefaults ? DEVICE_DEFAULTS.sim_pin : null)
  
  // Paramètres de sommeil et mesure
  addNumber('sleep_minutes_default', config.sleepMinutes || config.sleep_minutes, includeDefaults ? DEVICE_DEFAULTS.sleep_minutes : null)
  addNumber('measurement_duration_ms', config.measurementDurationMs || config.measurement_duration_ms, includeDefaults ? DEVICE_DEFAULTS.measurement_duration_ms : null)
  addNumber('send_every_n_wakeups', config.sendEveryNWakeups || config.send_every_n_wakeups, includeDefaults ? DEVICE_DEFAULTS.send_every_n_wakeups : null)
  
  // Coefficients de calibration
  if (config.calibration_coefficients && Array.isArray(config.calibration_coefficients) && config.calibration_coefficients.length === 3) {
    payload.calibration_coefficients = config.calibration_coefficients
  } else if (includeDefaults) {
    payload.calibration_coefficients = DEVICE_DEFAULTS.calibration_coefficients
  }
  
  // Paramètres de mesure airflow
  addNumber('airflow_passes', config.airflowPasses || config.airflow_passes, includeDefaults ? DEVICE_DEFAULTS.airflow_passes : null)
  addNumber('airflow_samples_per_pass', config.airflowSamples || config.airflow_samples_per_pass, includeDefaults ? DEVICE_DEFAULTS.airflow_samples_per_pass : null)
  addNumber('airflow_delay_ms', config.airflowDelay || config.airflow_delay_ms, includeDefaults ? DEVICE_DEFAULTS.airflow_delay_ms : null)
  
  // Paramètres réseau (itinérance et GPS)
  if (config.roamingEnabled !== undefined || config.roaming_enabled !== undefined) {
    payload.roaming_enabled = config.roamingEnabled !== undefined ? config.roamingEnabled : config.roaming_enabled
  } else if (includeDefaults) {
    payload.roaming_enabled = DEVICE_DEFAULTS.roaming_enabled
  }
  if (config.gpsEnabled !== undefined || config.gps_enabled !== undefined) {
    payload.gps_enabled = config.gpsEnabled !== undefined ? config.gpsEnabled : config.gps_enabled
  } else if (includeDefaults) {
    payload.gps_enabled = DEVICE_DEFAULTS.gps_enabled
  }
  
  // Paramètres modem
  addNumber('watchdog_seconds', config.watchdogSeconds || config.watchdog_seconds, includeDefaults ? DEVICE_DEFAULTS.watchdog_seconds : null)
  addNumber('modem_boot_timeout_ms', config.modemBootTimeout || config.modem_boot_timeout_ms, includeDefaults ? DEVICE_DEFAULTS.modem_boot_timeout_ms : null)
  addNumber('sim_ready_timeout_ms', config.simReadyTimeout || config.sim_ready_timeout_ms, includeDefaults ? DEVICE_DEFAULTS.sim_ready_timeout_ms : null)
  addNumber('network_attach_timeout_ms', config.networkAttachTimeout || config.network_attach_timeout_ms, includeDefaults ? DEVICE_DEFAULTS.network_attach_timeout_ms : null)
  addNumber('modem_max_reboots', config.modemReboots || config.modem_max_reboots, includeDefaults ? DEVICE_DEFAULTS.modem_max_reboots : null)
  
  // Paramètres OTA
  addString('ota_primary_url', config.otaPrimaryUrl || config.ota_primary_url)
  addString('ota_fallback_url', config.otaFallbackUrl || config.ota_fallback_url)
  addString('ota_md5', config.otaMd5 || config.ota_md5)
  
  return payload
}

/**
 * Crée une commande OTA pour un dispositif
 * @param {Function} fetchWithAuth - Fonction d'authentification
 * @param {string} API_URL - URL de l'API
 * @param {string} iccid - ICCID du dispositif
 * @param {string} command - Type de commande (UPDATE_CONFIG, UPDATE_CALIBRATION, etc.)
 * @param {Object} payload - Payload de la commande
 * @param {Object} options - Options supplémentaires
 * @param {string} options.priority - Priorité de la commande (low, normal, high)
 * @param {number} options.expiresInSeconds - Durée d'expiration en secondes
 * @returns {Promise<Object>} Réponse de l'API
 */
export async function createOtaCommand(fetchWithAuth, API_URL, iccid, command, payload, options = {}) {
  const commandBody = {
    command,
    payload,
    priority: options.priority || 'normal',
    expires_in_seconds: options.expiresInSeconds || 7 * 24 * 60 * 60 // 7 jours par défaut
  }
  
  try {
    const response = await fetchJson(
      fetchWithAuth,
      API_URL,
      `/api.php/devices/${iccid}/commands`,
      {
        method: 'POST',
        body: JSON.stringify(commandBody)
      },
      { requiresAuth: true }
    )
    
    logger.debug(`Commande OTA ${command} créée avec succès pour ${iccid}`)
    return response
  } catch (error) {
    logger.error(`Erreur création commande OTA ${command}:`, error)
    throw error
  }
}

/**
 * Crée une commande UPDATE_CONFIG pour un dispositif
 * @param {Function} fetchWithAuth - Fonction d'authentification
 * @param {string} API_URL - URL de l'API
 * @param {string} iccid - ICCID du dispositif
 * @param {Object} config - Configuration à appliquer
 * @param {Object} options - Options supplémentaires
 * @returns {Promise<Object>} Réponse de l'API
 */
export async function createUpdateConfigCommand(fetchWithAuth, API_URL, iccid, config, options = {}) {
  const payload = buildUpdateConfigPayload(config)
  
  if (Object.keys(payload).length === 0) {
    throw new Error('Veuillez renseigner au moins un champ de configuration')
  }
  
  return await createOtaCommand(fetchWithAuth, API_URL, iccid, 'UPDATE_CONFIG', payload, options)
}


