/**
 * Système robuste d'envoi de mesures avec retry et validation
 */

import { enqueueMeasurement, getPendingMeasurements, removeMeasurement, incrementRetry } from './measurementQueue'
import logger from './logger'

// Configuration
const MAX_RETRIES = 5
const RETRY_DELAYS = [1000, 2000, 5000, 10000, 30000] // Backoff exponentiel en ms

// Valider une mesure avant envoi
function validateMeasurement(measurement) {
  const errors = []

  // Vérifier l'ICCID
  if (!measurement.sim_iccid || typeof measurement.sim_iccid !== 'string') {
    errors.push('ICCID manquant ou invalide')
  } else if (measurement.sim_iccid.length > 20) {
    errors.push('ICCID trop long (max 20 caractères)')
  }

  // Vérifier le flowrate
  if (measurement.flowrate !== null && measurement.flowrate !== undefined) {
    const flowrate = Number(measurement.flowrate)
    if (isNaN(flowrate) || flowrate < 0 || flowrate > 1000) {
      errors.push(`Flowrate invalide: ${measurement.flowrate} (attendu: 0-1000 L/min)`)
    }
  }

  // Vérifier la batterie
  if (measurement.battery !== null && measurement.battery !== undefined) {
    const battery = Number(measurement.battery)
    if (isNaN(battery) || battery < 0 || battery > 100) {
      errors.push(`Batterie invalide: ${measurement.battery} (attendu: 0-100%)`)
    }
  }

  // Vérifier le RSSI
  // -999 est une valeur sentinelle valide pour "pas de signal" ou "erreur de mesure"
  if (measurement.rssi !== null && measurement.rssi !== undefined) {
    const rssi = Number(measurement.rssi)
    // Accepter -999 comme valeur spéciale valide (pas de signal/erreur)
    if (isNaN(rssi) || (rssi !== -999 && (rssi < -150 || rssi > 0))) {
      errors.push(`RSSI invalide: ${measurement.rssi} (attendu: -150 à 0 dBm, ou -999 pour "pas de signal")`)
    }
  }

  return {
    valid: errors.length === 0,
    errors
  }
}

// Normaliser une mesure
function normalizeMeasurement(measurement) {
  return {
    sim_iccid: String(measurement.sim_iccid || '').trim(),
    flowrate: measurement.flowrate !== null && measurement.flowrate !== undefined 
      ? Number(measurement.flowrate) 
      : 0,
    battery: measurement.battery !== null && measurement.battery !== undefined 
      ? Number(measurement.battery) 
      : null,
    rssi: measurement.rssi !== null && measurement.rssi !== undefined 
      ? Number(measurement.rssi) 
      : null,
    firmware_version: measurement.firmware_version || null,
    timestamp: measurement.timestamp || new Date().toISOString(),
    status: measurement.status || 'USB'
  }
}

// Envoyer une mesure avec retry
export async function sendMeasurementWithRetry(measurementData, sendFn, options = {}) {
  const { maxRetries = MAX_RETRIES, retryDelays = RETRY_DELAYS } = options

  // Normaliser et valider
  const normalized = normalizeMeasurement(measurementData)
  const validation = validateMeasurement(normalized)

  if (!validation.valid) {
    logger.error('Mesure invalide:', validation.errors, normalized)
    return { success: false, error: validation.errors.join(', ') }
  }

  // Essayer d'envoyer avec retry
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await sendFn(normalized)
      logger.debug(`✅ Mesure envoyée (tentative ${attempt + 1})`, normalized)
      return { success: true }
    } catch (err) {
      const isLastAttempt = attempt === maxRetries
      const delay = retryDelays[attempt] || retryDelays[retryDelays.length - 1]

      if (isLastAttempt) {
        logger.error('❌ Échec envoi mesure après toutes les tentatives:', err)
        // Ajouter à la queue pour retry ultérieur
        await enqueueMeasurement(normalized)
        return { success: false, error: err.message, queued: true }
      }

      logger.warn(`⚠️ Tentative ${attempt + 1}/${maxRetries + 1} échouée, retry dans ${delay}ms:`, err.message)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }

  return { success: false, error: 'Toutes les tentatives ont échoué' }
}

// Traiter la queue des mesures en attente
export async function processMeasurementQueue(sendFn, options = {}) {
  const { batchSize = 10, maxRetries = MAX_RETRIES } = options

  try {
    const pending = await getPendingMeasurements(batchSize)
    if (pending.length === 0) return { processed: 0, failed: 0 }

    let processed = 0
    let failed = 0

    for (const item of pending) {
      // Vérifier le nombre de retries
      if (item.retryCount >= maxRetries) {
        logger.warn('Mesure abandonnée (trop de retries):', item)
        await removeMeasurement(item.id)
        failed++
        continue
      }

      // Vérifier le délai depuis le dernier retry (backoff)
      const lastRetry = item.lastRetry || item.timestamp
      const delay = RETRY_DELAYS[Math.min(item.retryCount, RETRY_DELAYS.length - 1)]
      const timeSinceLastRetry = Date.now() - lastRetry

      if (timeSinceLastRetry < delay) {
        // Pas encore le moment de réessayer
        continue
      }

      // Essayer d'envoyer
      const result = await sendMeasurementWithRetry(item, sendFn, { maxRetries: 0 }) // Pas de retry ici, on gère dans la queue

      if (result.success) {
        await removeMeasurement(item.id)
        processed++
      } else {
        // Incrémenter le compteur de retry
        await incrementRetry(item.id)
        failed++
      }
    }

    return { processed, failed, total: pending.length }
  } catch (err) {
    logger.error('Erreur traitement queue:', err)
    return { processed: 0, failed: 0, error: err.message }
  }
}

// Démarrer le traitement périodique de la queue
let queueInterval = null

export function startQueueProcessor(sendFn, options = {}) {
  const { interval = 30000 } = options // 30 secondes par défaut

  if (queueInterval) {
    clearInterval(queueInterval)
  }

  // Traiter immédiatement
  processMeasurementQueue(sendFn, options)

  // Puis périodiquement
  queueInterval = setInterval(() => {
    processMeasurementQueue(sendFn, options)
  }, interval)

  return () => {
    if (queueInterval) {
      clearInterval(queueInterval)
      queueInterval = null
    }
  }
}

export function stopQueueProcessor() {
  if (queueInterval) {
    clearInterval(queueInterval)
    queueInterval = null
  }
}

