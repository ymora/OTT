/**
 * Utilitaire pour géolocaliser une adresse IP
 * Utilise plusieurs services gratuits en fallback
 */

/**
 * Géolocalise une adresse IP
 * @param {string} ipAddress - L'adresse IP à géolocaliser
 * @returns {Promise<{lat: number, lng: number, city?: string, country?: string} | null>}
 */
export async function geolocateIP(ipAddress) {
  if (!ipAddress || typeof ipAddress !== 'string') {
    return null
  }

  // Valider le format de l'IP (IPv4 ou IPv6 basique)
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/
  if (!ipv4Regex.test(ipAddress) && !ipv6Regex.test(ipAddress)) {
    console.warn('Format IP invalide:', ipAddress)
    return null
  }

  // Services de géolocalisation IP (gratuits)
  const services = [
    // Service 1: ipapi.co (gratuit, 1000 requêtes/jour)
    async () => {
      const response = await fetch(`https://ipapi.co/${ipAddress}/json/`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('ipapi.co failed')
      const data = await response.json()
      if (data.latitude && data.longitude) {
        return {
          lat: parseFloat(data.latitude),
          lng: parseFloat(data.longitude),
          city: data.city,
          country: data.country_name
        }
      }
      throw new Error('Invalid response from ipapi.co')
    },
    // Service 2: ip-api.com (gratuit, 45 requêtes/min)
    async () => {
      const response = await fetch(`http://ip-api.com/json/${ipAddress}`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('ip-api.com failed')
      const data = await response.json()
      if (data.status === 'success' && data.lat && data.lon) {
        return {
          lat: parseFloat(data.lat),
          lng: parseFloat(data.lon),
          city: data.city,
          country: data.country
        }
      }
      throw new Error('Invalid response from ip-api.com')
    },
    // Service 3: geojs.io (gratuit, pas de limite connue)
    async () => {
      const response = await fetch(`https://get.geojs.io/v1/ip/geo/${ipAddress}.json`, {
        signal: AbortSignal.timeout(5000)
      })
      if (!response.ok) throw new Error('geojs.io failed')
      const data = await response.json()
      if (data.latitude && data.longitude) {
        return {
          lat: parseFloat(data.latitude),
          lng: parseFloat(data.longitude),
          city: data.city,
          country: data.country
        }
      }
      throw new Error('Invalid response from geojs.io')
    }
  ]

  // Essayer chaque service jusqu'à ce qu'un fonctionne
  for (const service of services) {
    try {
      const result = await service()
      if (result && result.lat && result.lng) {
        // Valider les coordonnées
        if (
          !isNaN(result.lat) &&
          !isNaN(result.lng) &&
          isFinite(result.lat) &&
          isFinite(result.lng) &&
          result.lat >= -90 &&
          result.lat <= 90 &&
          result.lng >= -180 &&
          result.lng <= 180
        ) {
          return result
        }
      }
    } catch (err) {
      // Continuer avec le service suivant
      console.warn('Service de géolocalisation IP échoué:', err.message)
    }
  }

  // Si tous les services ont échoué
  console.warn('Tous les services de géolocalisation IP ont échoué pour:', ipAddress)
  return null
}

