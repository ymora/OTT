/**
 * Hook pour gérer les états asynchrones (loading, error, success)
 * Unifie les patterns useState répétitifs pour loading/error/success
 * @module hooks/useAsyncState
 */

import { useState, useCallback } from 'react'

/**
 * Hook pour gérer les états d'une opération asynchrone
 * @param {Object} options - Options de configuration
 * @param {boolean} options.initialLoading - État initial de loading (défaut: false)
 * @returns {Object} { loading, error, success, setLoading, setError, setSuccess, reset, execute }
 */
export function useAsyncState(options = {}) {
  const { initialLoading = false } = options
  
  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setSuccess(null)
  }, [])

  const execute = useCallback(async (asyncFn, options = {}) => {
    const { onSuccess, onError, successMessage } = options
    
    try {
      setLoading(true)
      setError(null)
      setSuccess(null)
      
      const result = await asyncFn()
      
      if (successMessage) {
        setSuccess(successMessage)
      }
      
      if (onSuccess) {
        onSuccess(result)
      }
      
      return result
    } catch (err) {
      const errorMessage = err.message || 'Une erreur est survenue'
      setError(errorMessage)
      
      if (onError) {
        onError(err)
      }
      
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

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

