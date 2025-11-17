/**
 * Hook personnalisé pour charger des données depuis l'API
 * Élimine la duplication de code dans toutes les pages
 * @module hooks/useApiData
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'

/**
 * Hook pour charger des données depuis l'API avec gestion automatique du loading et des erreurs
 * @param {string|string[]} endpoints - Endpoint(s) API à charger
 * @param {Object} options - Options de configuration
 * @param {boolean} options.autoLoad - Charger automatiquement au mount (défaut: true)
 * @param {boolean} options.requiresAuth - Requiert authentification (défaut: false)
 * @param {Object} options.fetchOptions - Options supplémentaires pour fetch
 * @returns {Object} { data, loading, error, refetch, setData }
 */
export function useApiData(endpoints, options = {}) {
  const { fetchWithAuth, API_URL } = useAuth()
  const { autoLoad = true, requiresAuth = false, fetchOptions = {} } = options

  const isMultiple = Array.isArray(endpoints)
  const [data, setData] = useState(isMultiple ? {} : null)
  const [loading, setLoading] = useState(autoLoad)
  const [error, setError] = useState(null)

  // Mémoriser les endpoints pour éviter les re-renders inutiles
  // Convertir en string pour comparaison stable
  const endpointsKey = useMemo(() => {
    return isMultiple ? JSON.stringify(endpoints) : endpoints
  }, [endpoints, isMultiple])

  // Mémoriser fetchOptions pour éviter les re-renders inutiles
  // Note: fetchOptions est généralement stable, donc on le mémorise une fois
  const memoizedFetchOptions = useMemo(() => fetchOptions, [])

  const loadData = useCallback(async () => {
    try {
      setError(null)
      setLoading(true)

      // Utiliser les endpoints originaux (pas la clé)
      const endpointsToUse = isMultiple ? endpoints : [endpoints]

      if (isMultiple) {
        // Charger plusieurs endpoints en parallèle
        const promises = endpointsToUse.map(endpoint =>
          fetchJson(fetchWithAuth, API_URL, endpoint, memoizedFetchOptions, { requiresAuth })
            .catch(err => {
              console.error(`Erreur chargement ${endpoint}:`, err)
              return null // Retourner null en cas d'erreur pour ne pas bloquer les autres
            })
        )

        const results = await Promise.all(promises)
        const dataMap = {}
        endpointsToUse.forEach((endpoint, index) => {
          // Extraire le nom de la clé depuis l'endpoint (ex: /api.php/devices -> devices)
          // Gérer les endpoints avec query params (ex: /api.php/logs?limit=200 -> logs)
          const endpointPath = endpoint.split('?')[0] // Enlever les query params
          const key = endpointPath.split('/').pop() || 'data'
          dataMap[key] = results[index]
        })
        setData(dataMap)
      } else {
        // Charger un seul endpoint
        const result = await fetchJson(fetchWithAuth, API_URL, endpointsToUse[0], memoizedFetchOptions, { requiresAuth })
        setData(result)
      }
    } catch (err) {
      console.error('Erreur chargement données:', err)
      setError(err.message || 'Erreur lors du chargement des données')
      setData(isMultiple ? {} : null)
    } finally {
      setLoading(false)
    }
  }, [endpoints, fetchWithAuth, API_URL, requiresAuth, isMultiple, memoizedFetchOptions])

  useEffect(() => {
    if (autoLoad) {
      loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, endpointsKey])

  return {
    data,
    loading,
    error,
    refetch: loadData,
    setData
  }
}

