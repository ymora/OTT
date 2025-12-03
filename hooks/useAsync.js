import { useState, useCallback } from 'react'
import { logger } from '@/lib/logger'

/**
 * Hook pour gérer les opérations asynchrones (loading, error, success)
 * Réduit la duplication de code pour les try/catch et états de chargement
 * 
 * @returns {Object} - { loading, error, execute, reset, success }
 * 
 * @example
 * const { loading, error, execute, success } = useAsync()
 * 
 * const handleSubmit = () => {
 *   execute(async () => {
 *     await api.save(data)
 *   })
 * }
 * 
 * // Au lieu de:
 * // const [loading, setLoading] = useState(false)
 * // const [error, setError] = useState(null)
 * // try {
 * //   setLoading(true)
 * //   await api.save(data)
 * // } catch (err) {
 * //   setError(err)
 * // } finally {
 * //   setLoading(false)
 * // }
 */
export function useAsync() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  const execute = useCallback(async (asyncFunction) => {
    try {
      setLoading(true)
      setError(null)
      setSuccess(false)

      const result = await asyncFunction()
      
      setSuccess(true)
      return result
    } catch (err) {
      const errorMessage = err.message || 'Une erreur est survenue'
      setError(errorMessage)
      logger.error('useAsync error:', err)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  const reset = useCallback(() => {
    setLoading(false)
    setError(null)
    setSuccess(false)
  }, [])

  return { loading, error, success, execute, reset }
}

