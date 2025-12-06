/**
 * Helpers pour les appels API avec gestion d'erreur standardisée
 * @module lib/apiHelpers
 */

import logger from './logger'

/**
 * Wrapper pour les appels API avec gestion d'erreur standardisée
 * @param {Function} fetchFn - Fonction fetch (fetchWithAuth ou fetch)
 * @param {string} url - URL de l'API
 * @param {Object} options - Options de fetch
 * @param {Object} config - Configuration supplémentaire
 * @param {boolean} config.requiresAuth - Requiert authentification
 * @param {Function} config.onSuccess - Callback en cas de succès
 * @param {Function} config.onError - Callback en cas d'erreur
 * @returns {Promise<Object>} Résultat de l'appel API
 */
export async function safeApiCall(fetchFn, url, options = {}, config = {}) {
  const { requiresAuth = false, onSuccess, onError } = config

  try {
    const response = await fetchFn(url, options, { requiresAuth })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const error = new Error(errorData.error || `Erreur HTTP ${response.status}`)
      error.status = response.status
      error.data = errorData
      
      if (onError) {
        onError(error)
      } else {
        logger.error(`Erreur API ${url}:`, error)
      }
      
      throw error
    }

    const result = await response.json()
    
    if (onSuccess) {
      onSuccess(result)
    }
    
    return result
  } catch (err) {
    if (err.status) {
      // Erreur HTTP déjà gérée
      throw err
    }
    
    // Erreur réseau ou autre
    const error = new Error(err.message || 'Erreur lors de l\'appel API')
    error.originalError = err
    
    if (onError) {
      onError(error)
    } else {
      logger.error(`Erreur réseau ${url}:`, error)
    }
    
    throw error
  }
}

/**
 * Wrapper pour les appels API avec retry automatique
 * @param {Function} fetchFn - Fonction fetch
 * @param {string} url - URL de l'API
 * @param {Object} options - Options de fetch
 * @param {Object} config - Configuration
 * @param {number} config.maxRetries - Nombre maximum de tentatives (défaut: 3)
 * @param {number} config.retryDelay - Délai entre les tentatives en ms (défaut: 1000)
 * @returns {Promise<Object>} Résultat de l'appel API
 */
export async function apiCallWithRetry(fetchFn, url, options = {}, config = {}) {
  const { maxRetries = 3, retryDelay = 1000, ...restConfig } = config
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await safeApiCall(fetchFn, url, options, restConfig)
    } catch (err) {
      lastError = err
      
      // Ne pas retry pour les erreurs 4xx (erreurs client)
      if (err.status >= 400 && err.status < 500) {
        throw err
      }
      
      // Attendre avant de retry (sauf dernière tentative)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)))
      }
    }
  }

  throw lastError
}

/**
 * Batch plusieurs appels API en parallèle
 * @param {Array<{fetchFn: Function, url: string, options: Object, config: Object}>} calls - Liste des appels
 * @returns {Promise<Array>} Résultats des appels
 */
export async function batchApiCalls(calls) {
  const promises = calls.map(({ fetchFn, url, options = {}, config = {} }) =>
    safeApiCall(fetchFn, url, options, config).catch(err => ({ error: err }))
  )
  
  return Promise.all(promises)
}

