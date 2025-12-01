/**
 * Hook personnalisé pour charger des données depuis l'API
 * Élimine la duplication de code dans toutes les pages
 * @module hooks/useApiData
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { fetchJson } from '@/lib/api'
import logger from '@/lib/logger'

// Cache simple en mémoire (peut être amélioré avec localStorage ou un cache plus sophistiqué)
const cache = new Map()
const CACHE_TTL = 30000 // 30 secondes par défaut

/**
 * Hook pour charger des données depuis l'API avec gestion automatique du loading et des erreurs
 * @param {string|string[]} endpoints - Endpoint(s) API à charger
 * @param {Object} options - Options de configuration
 * @param {boolean} options.autoLoad - Charger automatiquement au mount (défaut: true)
 * @param {boolean} options.requiresAuth - Requiert authentification (défaut: false)
 * @param {Object} options.fetchOptions - Options supplémentaires pour fetch
 * @param {number} options.cacheTTL - Durée de vie du cache en ms (défaut: 30000, 0 pour désactiver)
 * @returns {Object} { data, loading, error, refetch, setData, invalidateCache }
 */
export function useApiData(endpoints, options = {}) {
  const { fetchWithAuth, API_URL } = useAuth()
  const { autoLoad = true, requiresAuth = false, fetchOptions = {}, cacheTTL = CACHE_TTL } = options
  const cacheKeyRef = useRef(null)

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

  const loadData = useCallback(async (forceRefresh = false) => {
    try {
      setError(null)
      
      // Générer la clé de cache
      const cacheKey = isMultiple ? JSON.stringify(endpoints) : endpoints
      cacheKeyRef.current = cacheKey

      // Vérifier le cache si activé et pas de force refresh
      if (cacheTTL > 0 && !forceRefresh) {
        const cached = cache.get(cacheKey)
        if (cached && (Date.now() - cached.timestamp) < cacheTTL) {
          setData(cached.data)
          setLoading(false)
          return
        }
      }

      setLoading(true)

      // Utiliser les endpoints originaux (pas la clé)
      const endpointsToUse = isMultiple ? endpoints : [endpoints]

      if (isMultiple) {
        // Charger plusieurs endpoints en parallèle
        const promises = endpointsToUse.map(endpoint =>
          fetchJson(fetchWithAuth, API_URL, endpoint, memoizedFetchOptions, { requiresAuth })
            .catch(err => {
              logger.error(`Erreur chargement ${endpoint}:`, err)
              // Retourner un objet avec success: false pour indiquer l'erreur
              return { 
                success: false, 
                error: err.message || 'Erreur lors du chargement',
                data: null 
              }
            })
        )

        const results = await Promise.all(promises)
        const dataMap = {}
        endpointsToUse.forEach((endpoint, index) => {
          // Extraire le nom de la clé depuis l'endpoint (ex: /api.php/devices -> devices)
          // Gérer les endpoints avec query params (ex: /api.php/logs?limit=200 -> logs)
          const endpointPath = endpoint.split('?')[0] // Enlever les query params
          const key = endpointPath.split('/').pop() || 'data'
          // Stocker le résultat même s'il y a une erreur (pour permettre l'affichage d'erreurs partielles)
          dataMap[key] = results[index]
        })
        
        // Mettre en cache si activé
        if (cacheTTL > 0) {
          cache.set(cacheKey, { data: dataMap, timestamp: Date.now() })
        }
        
        setData(dataMap)
      } else {
        // Charger un seul endpoint
        const result = await fetchJson(fetchWithAuth, API_URL, endpointsToUse[0], memoizedFetchOptions, { requiresAuth })
        
        // Mettre en cache si activé
        if (cacheTTL > 0) {
          cache.set(cacheKey, { data: result, timestamp: Date.now() })
        }
        
        setData(result)
      }
    } catch (err) {
      logger.error('Erreur chargement données:', err)
      setError(err.message || 'Erreur lors du chargement des données')
      setData(isMultiple ? {} : null)
    } finally {
      setLoading(false)
    }
  }, [endpoints, fetchWithAuth, API_URL, requiresAuth, isMultiple, memoizedFetchOptions, cacheTTL])

  useEffect(() => {
    if (autoLoad) {
      loadData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoLoad, endpointsKey])

  // Fonction pour invalider le cache
  const invalidateCache = useCallback(() => {
    if (cacheKeyRef.current) {
      cache.delete(cacheKeyRef.current)
    }
  }, [])

  // Fonction pour refetch avec force refresh
  const refetch = useCallback(() => {
    return loadData(true)
  }, [loadData])

  return {
    data,
    loading,
    error,
    refetch,
    setData,
    invalidateCache
  }
}

// Fonction utilitaire pour invalider tout le cache
export function clearApiCache() {
  cache.clear()
}
