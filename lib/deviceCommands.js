/**
 * Utilitaires pour la création de commandes OTA pour les dispositifs
 * Centralise la logique de construction des payloads pour éviter les doublons
 */

import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

/**
 * Construit le payload pour la commande UPDATE_CONFIG
 * @param {Object} config - Configuration avec les paramètres à mettre à jour
 * @returns {Object} Payload pour UPDATE_CONFIG
 */
export function buildUpdateConfigPayload(config) {
  const payload = {}
  
  const addString = (key, value) => {
    const trimmed = (value ?? '').trim()
    if (trimmed) {
      payload[key] = trimmed
    }
  }
  
  const addNumber = (key, value) => {
    if (value === '' || value === null || value === undefined) return
    const num = Number(value)
    if (Number.isFinite(num)) {
      payload[key] = num
    }
  }
  
  // Paramètres réseau
  addString('apn', config.apn)
  addString('jwt', config.jwt)
  addString('iccid', config.iccid)
  addString('serial', config.serial)
  addString('sim_pin', config.simPin)
  
  // Paramètres de sommeil et mesure
  addNumber('sleep_minutes_default', config.sleepMinutes || config.sleep_minutes)
  addNumber('measurement_duration_ms', config.measurementDurationMs || config.measurement_duration_ms)
  addNumber('send_every_n_wakeups', config.sendEveryNWakeups || config.send_every_n_wakeups)
  
  // Paramètres de mesure airflow
  addNumber('airflow_passes', config.airflowPasses)
  addNumber('airflow_samples_per_pass', config.airflowSamples)
  addNumber('airflow_delay_ms', config.airflowDelay)
  
  // Paramètres réseau (itinérance et GPS)
  if (config.roamingEnabled !== undefined || config.roaming_enabled !== undefined) {
    payload.roaming_enabled = config.roamingEnabled !== undefined ? config.roamingEnabled : config.roaming_enabled
  }
  if (config.gpsEnabled !== undefined || config.gps_enabled !== undefined) {
    payload.gps_enabled = config.gpsEnabled !== undefined ? config.gpsEnabled : config.gps_enabled
  }
  
  // Paramètres modem
  addNumber('watchdog_seconds', config.watchdogSeconds)
  addNumber('modem_boot_timeout_ms', config.modemBootTimeout)
  addNumber('sim_ready_timeout_ms', config.simReadyTimeout)
  addNumber('network_attach_timeout_ms', config.networkAttachTimeout)
  addNumber('modem_max_reboots', config.modemReboots)
  
  // Paramètres OTA
  addString('ota_primary_url', config.otaPrimaryUrl)
  addString('ota_fallback_url', config.otaFallbackUrl)
  addString('ota_md5', config.otaMd5)
  
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


