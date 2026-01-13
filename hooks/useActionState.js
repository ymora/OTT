/**
 * Hook pour gérer les états d'une action (loading, error, success)
 * Réduit la duplication de useState pour les actions asynchrones
 * @module hooks/useActionState
 */

import { useState, useCallback } from 'react'

/**
 * Hook pour gérer les états d'une action asynchrone
 * @param {Object} options - Options de configuration
 * @param {boolean} options.resetOnNewAction - Réinitialiser l'erreur/succès au début d'une nouvelle action (défaut: true)
 * @returns {Object} { loading, error, success, setLoading, setError, setSuccess, reset, execute }
 */
export function useActionState(options = {}) {
  const { resetOnNewAction = true } = options
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setSuccess(null)
  }, [])

  /**
   * Exécute une action asynchrone avec gestion automatique des états
   * @param {Function} action - Fonction async à exécuter
   * @param {Object} options - Options
   * @param {Function} options.onSuccess - Callback en cas de succès
   * @param {Function} options.onError - Callback en cas d'erreur
   * @returns {Promise} Promesse résolue/rejetée
   */
  const execute = useCallback(async (action, { onSuccess, onError } = {}) => {
    if (resetOnNewAction) {
      setError(null)
      setSuccess(null)
    }
    setLoading(true)
    
    try {
      const result = await action()
      setLoading(false)
      setSuccess(true)
      if (onSuccess) {
        onSuccess(result)
      }
      return result
    } catch (err) {
      const errorMessage = err?.message || err?.toString() || 'Une erreur est survenue'
      setError(errorMessage)
      setLoading(false)
      if (onError) {
        onError(err)
      }
      throw err
    }
  }, [resetOnNewAction])

  return {
    loading,
    error,
    success,
    setLoading,
    setError,
    setSuccess,
    reset,
    execute
  }
}

