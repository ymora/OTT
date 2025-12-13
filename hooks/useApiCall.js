/**
 * Hook pour simplifier les appels API avec gestion automatique des états
 * Élimine la duplication de try/catch et useState pour loading/error
 * @module hooks/useApiCall
 */

import { useState, useCallback, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

/**
 * Hook pour faire des appels API avec gestion automatique des états
 * @param {Object} options - Options de configuration
 * @param {boolean} options.requiresAuth - Requiert authentification (défaut: true)
 * @param {boolean} options.autoReset - Réinitialiser automatiquement error/success après un délai (défaut: false)
 * @param {number} options.resetDelay - Délai avant réinitialisation en ms (défaut: 5000)
 * @returns {Object} { loading, error, success, call, reset }
 */
export function useApiCall(options = {}) {
  const { fetchWithAuth, API_URL } = useAuth()
  const { requiresAuth = true, autoReset = false, resetDelay = 5000 } = options
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const resetTimeoutRef = useRef(null)

  const reset = useCallback(() => {
    setError(null)
    setSuccess(null)
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current)
      resetTimeoutRef.current = null
    }
  }, [])

  const call = useCallback(async (endpoint, fetchOptions = {}, config = {}) => {
    setLoading(true)
    setError(null)
    setSuccess(null)
    
    // Annuler le timeout de reset précédent si existant
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current)
      resetTimeoutRef.current = null
    }
    
    try {
      const finalConfig = { ...config, requiresAuth: config.requiresAuth !== undefined ? config.requiresAuth : requiresAuth }
      const data = await fetchJson(fetchWithAuth, API_URL, endpoint, fetchOptions, finalConfig)
      
      setLoading(false)
      
      // Si autoReset est activé, programmer la réinitialisation
      if (autoReset) {
        resetTimeoutRef.current = setTimeout(() => {
          reset()
        }, resetDelay)
      }
      
      return data
    } catch (err) {
      const errorMessage = err.message || 'Une erreur est survenue'
      logger.error(`[useApiCall] Erreur sur ${endpoint}:`, err)
      setError(errorMessage)
      setLoading(false)
      
      // Si autoReset est activé, programmer la réinitialisation
      if (autoReset) {
        resetTimeoutRef.current = setTimeout(() => {
          reset()
        }, resetDelay)
      }
      
      throw err
    }
  }, [fetchWithAuth, API_URL, requiresAuth, autoReset, resetDelay, reset])

  return {
    loading,
    error,
    success,
    call,
    reset,
    setError,
    setSuccess
  }
}

