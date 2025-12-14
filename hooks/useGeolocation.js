/**
 * Hook personnalisé pour obtenir la géolocalisation du PC
 * Essaie d'abord le GPS du navigateur, puis utilise la géolocalisation IP
 * @module hooks/useGeolocation
 */

import { useState, useEffect } from 'react'

/**
 * Hook pour obtenir la géolocalisation du PC
 * @param {Object} options - Options de configuration
 * @param {boolean} options.enableHighAccuracy - Activer la haute précision pour GPS (défaut: false)
 * @param {number} options.timeout - Timeout en ms pour GPS (défaut: 10000)
 * @param {number} options.maximumAge - Âge maximum du cache GPS en ms (défaut: 300000 = 5 min)
 * @returns {Object} { latitude, longitude, loading, error, source }
 */
export function useGeolocation(options = {}) {
  const {
    enableHighAccuracy = false,
    timeout = 10000,
    maximumAge = 300000 // 5 minutes
  } = options

  const [latitude, setLatitude] = useState(null)
  const [longitude, setLongitude] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [source, setSource] = useState(null) // 'gps' | 'ip' | null

  useEffect(() => {
    let mounted = true
    let geoWatchId = null

    // Fonction pour obtenir la géolocalisation via IP
    const getLocationByIP = async () => {
      try {
        // Essayer plusieurs services de géolocalisation IP (gratuits)
        const services = [
          // Service 1: ipapi.co (gratuit, 1000 requêtes/jour)
          async () => {
            const response = await fetch('https://ipapi.co/json/', {
              signal: AbortSignal.timeout(5000)
            })
            if (!response.ok) throw new Error('ipapi.co failed')
            const data = await response.json()
            if (data.latitude && data.longitude) {
              return { lat: data.latitude, lng: data.longitude }
            }
            throw new Error('Invalid response from ipapi.co')
          },
          // Service 2: ip-api.com (gratuit, 45 requêtes/min)
          async () => {
            const response = await fetch('http://ip-api.com/json/', {
              signal: AbortSignal.timeout(5000)
            })
            if (!response.ok) throw new Error('ip-api.com failed')
            const data = await response.json()
            if (data.status === 'success' && data.lat && data.lon) {
              return { lat: data.lat, lng: data.lon }
            }
            throw new Error('Invalid response from ip-api.com')
          },
          // Service 3: geojs.io (gratuit, pas de limite connue)
          async () => {
            const response = await fetch('https://get.geojs.io/v1/ip/geo.json', {
              signal: AbortSignal.timeout(5000)
            })
            if (!response.ok) throw new Error('geojs.io failed')
            const data = await response.json()
            if (data.latitude && data.longitude) {
              return { lat: parseFloat(data.latitude), lng: parseFloat(data.longitude) }
            }
            throw new Error('Invalid response from geojs.io')
          }
        ]

        // Essayer chaque service jusqu'à ce qu'un fonctionne
        for (const service of services) {
          try {
            const result = await service()
            if (mounted && result.lat && result.lng) {
              setLatitude(result.lat)
              setLongitude(result.lng)
              setSource('ip')
              setLoading(false)
              setError(null)
              return
            }
          } catch (err) {
            // Continuer avec le service suivant
            console.warn('Geolocation service failed:', err.message)
          }
        }

        // Si tous les services ont échoué
        throw new Error('Tous les services de géolocalisation IP ont échoué')
      } catch (err) {
        if (mounted) {
          console.error('Erreur géolocalisation IP:', err)
          setError(err.message)
          setLoading(false)
        }
      }
    }

    // Fonction de succès pour le GPS
    const onGPSSuccess = (position) => {
      if (!mounted) return
      const lat = position.coords.latitude
      const lng = position.coords.longitude

      // Vérifier que les coordonnées sont valides
      if (
        typeof lat === 'number' &&
        typeof lng === 'number' &&
        !isNaN(lat) &&
        !isNaN(lng) &&
        isFinite(lat) &&
        isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180
      ) {
        setLatitude(lat)
        setLongitude(lng)
        setSource('gps')
        setLoading(false)
        setError(null)
      } else {
        // Coordonnées invalides, essayer IP
        getLocationByIP()
      }
    }

    // Fonction d'erreur pour le GPS
    const onGPSError = (err) => {
      if (!mounted) return
      console.warn('GPS non disponible, utilisation de la géolocalisation IP:', err.message)
      // Essayer la géolocalisation IP en fallback
      getLocationByIP()
    }

    // Vérifier si le navigateur supporte la géolocalisation
    if (navigator.geolocation) {
      // Essayer d'abord le GPS
      try {
        geoWatchId = navigator.geolocation.watchPosition(
          onGPSSuccess,
          onGPSError,
          {
            enableHighAccuracy,
            timeout,
            maximumAge
          }
        )
      } catch (err) {
        // Si watchPosition échoue, essayer getCurrentPosition
        navigator.geolocation.getCurrentPosition(
          onGPSSuccess,
          onGPSError,
          {
            enableHighAccuracy,
            timeout,
            maximumAge
          }
        )
      }
    } else {
      // Pas de support GPS, utiliser directement IP
      getLocationByIP()
    }

    // Cleanup
    return () => {
      mounted = false
      if (geoWatchId !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(geoWatchId)
      }
    }
  }, [enableHighAccuracy, timeout, maximumAge])

  return { latitude, longitude, loading, error, source }
}
