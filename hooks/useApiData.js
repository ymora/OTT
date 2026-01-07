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
  const { fetchWithAuth, API_URL, user } = useAuth()
  const { autoLoad = true, requiresAuth = false, fetchOptions = {}, cacheTTL = CACHE_TTL, skip = false } = options
  const cacheKeyRef = useRef(null)

  const isMultiple = Array.isArray(endpoints)
  const [data, setData] = useState(isMultiple ? {} : null)
  const [loading, setLoading] = useState(autoLoad && !skip)
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
    // Ne pas charger si skip est true
    if (skip) {
      logger.debug('[useApiData] Chargement ignoré (skip=true)')
      setLoading(false)
      return
    }
    
    // Ne pas charger si l'utilisateur n'est pas authentifié et que l'auth est requise
    if (requiresAuth && !user) {
      logger.debug('[useApiData] Utilisateur non authentifié, arrêt du chargement')
      setLoading(false)
      return
    }

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
              // Si la session est expirée, ne pas logger l'erreur (déjà géré par AuthContext)
              if (err.message === 'Session expirée' || err.message === 'Non authentifié') {
                logger.debug(`[useApiData] Session expirée pour ${endpoint}, arrêt du chargement`)
                // Retourner un objet vide pour éviter les erreurs dans l'UI
                return { 
                  success: false, 
                  error: 'Session expirée',
                  data: null 
                }
              }
              
              // Logger l'erreur avec tous les détails disponibles
              logger.error(`Erreur chargement ${endpoint}:`, err)
              if (err.details) {
                logger.error(`Détails erreur ${endpoint}:`, err.details)
              }
              if (err.code) {
                logger.error(`Code erreur ${endpoint}:`, err.code)
              }
              
              // Détecter si l'API est indisponible (déploiement en cours)
              const isApiUnavailable = err.message?.includes('Réponse vide') || 
                                       err.message?.includes('Failed to fetch') ||
                                       err.message?.includes('NetworkError')
              if (isApiUnavailable && typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('api_status', { 
                  detail: { type: 'api_unavailable', endpoint } 
                }))
              }
              
              // Retourner un objet avec success: false pour indiquer l'erreur
              return { 
                success: false, 
                error: err.message || 'Erreur lors du chargement',
                details: err.details || null,
                code: err.code || null,
                file: err.file || null,
                line: err.line || null,
                data: null,
                isApiUnavailable
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
          
          // IMPORTANT: Si on charge plusieurs fois le même endpoint avec des query params différents
          // (ex: /api.php/users et /api.php/users?include_deleted=true), on préfère toujours
          // la version la plus complète (avec query params car elle inclut plus de données)
          if (!dataMap[key] || endpoint.includes('?')) {
            // Stocker le résultat même s'il y a une erreur (pour permettre l'affichage d'erreurs partielles)
            dataMap[key] = results[index]
          }
          // Si dataMap[key] existe déjà et endpoint n'a pas de query params, on ne l'écrase pas
          // Cela préserve la version plus complète avec include_deleted si elle existe déjà
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
      // Si la session est expirée, ne pas logger l'erreur (déjà géré par AuthContext)
      if (err.message === 'Session expirée' || err.message === 'Non authentifié') {
        logger.debug('[useApiData] Session expirée, arrêt du chargement')
        setError(null) // Ne pas afficher d'erreur, la redirection est en cours
        setData(isMultiple ? {} : null)
      } else {
        logger.error('Erreur chargement données:', err)
        if (err.details) {
          logger.error('Détails erreur:', err.details)
        }
        if (err.code) {
          logger.error('Code erreur:', err.code)
        }
        // Construire un message d'erreur détaillé
        let errorMessage = err.message || 'Erreur lors du chargement des données'
        if (err.details && Array.isArray(err.details)) {
          errorMessage += ` (${err.details.join(', ')})`
        } else if (err.details) {
          errorMessage += ` (${JSON.stringify(err.details)})`
        }
        if (err.file && err.line) {
          errorMessage += ` [${err.file}:${err.line}]`
        }
        setError(errorMessage)
        setData(isMultiple ? {} : null)
      }
    } finally {
      setLoading(false)
    }
  }, [endpoints, fetchWithAuth, API_URL, requiresAuth, isMultiple, memoizedFetchOptions, cacheTTL, user])

  useEffect(() => {
    if (autoLoad && !skip) {
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
