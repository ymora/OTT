/**
 * Gestionnaire d'erreurs centralisé pour réduire la duplication de try/catch
 * @module lib/errorHandler
 */

import logger from './logger'

/**
 * Wrapper pour exécuter une fonction async avec gestion d'erreur standardisée
 * @param {Function} asyncFn - Fonction async à exécuter
 * @param {Object} options - Options de gestion d'erreur
 * @param {Function} options.onError - Callback en cas d'erreur
 * @param {string} options.errorMessage - Message d'erreur par défaut
 * @param {boolean} options.logError - Logger l'erreur (défaut: true)
 * @returns {Promise<*>} Résultat de la fonction
 */
export async function withErrorHandling(asyncFn, options = {}) {
  const {
    onError,
    errorMessage = 'Une erreur est survenue',
    logError = true
  } = options

  try {
    return await asyncFn()
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    
    if (logError) {
      logger.error(errorMessage, error)
    }
    
    if (onError) {
      onError(error)
    }
    
    throw error
  }
}

/**
 * Wrapper pour exécuter une fonction sync avec gestion d'erreur
 * @param {Function} fn - Fonction à exécuter
 * @param {Object} options - Options de gestion d'erreur
 * @returns {*} Résultat de la fonction
 */
export function withErrorHandlingSync(fn, options = {}) {
  const {
    onError,
    errorMessage = 'Une erreur est survenue',
    logError = true,
    defaultValue = null
  } = options

  try {
    return fn()
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err))
    
    if (logError) {
      logger.error(errorMessage, error)
    }
    
    if (onError) {
      onError(error)
    }
    
    return defaultValue
  }
}

/**
 * Créer un handler d'erreur réutilisable
 * @param {Object} config - Configuration
 * @returns {Function} Handler d'erreur
 */
export function createErrorHandler(config = {}) {
  const {
    defaultMessage = 'Une erreur est survenue',
    logErrors = true,
    onError: globalOnError
  } = config

  return (error, customMessage = null) => {
    const message = customMessage || defaultMessage
    const err = error instanceof Error ? error : new Error(String(error))
    
    if (logErrors) {
      logger.error(message, err)
    }
    
    if (globalOnError) {
      globalOnError(err, message)
    }
    
    return err
  }
}

