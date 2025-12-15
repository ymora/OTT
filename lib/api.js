/**
 * Fonction utilitaire pour faire des appels API avec gestion d'erreurs améliorée
 * @module lib/api
 */

/**
 * Fait un appel API et retourne les données JSON
 * @param {Function} fetchWithAuth - Fonction fetch avec authentification
 * @param {string} API_URL - URL de base de l'API
 * @param {string} path - Chemin de l'endpoint
 * @param {Object} options - Options pour fetch (méthode, body, etc.)
 * @param {Object} config - Configuration (requiresAuth, etc.)
 * @returns {Promise<Object>} Données JSON de la réponse
 * @throws {Error} Si la requête échoue ou si data.success est false
 */
export async function fetchJson(fetchWithAuth, API_URL, path, options = {}, config = {}) {
  try {
    // Vérifier que l'URL API est valide
    if (!API_URL || !path) {
      throw new Error(`URL API invalide: API_URL=${API_URL}, path=${path}`)
    }
    
    const fullUrl = `${API_URL}${path}`
    
    // Log pour debug (uniquement en dev et si explicitement activé)
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost' && process.env.NODE_ENV === 'development') {
      // Log uniquement en mode développement explicite
      // console.log('[fetchJson] Requête vers:', fullUrl)
    }
    
    const response = await fetchWithAuth(fullUrl, options, config)
    
    // Lire le texte de la réponse UNE SEULE FOIS (le body ne peut être lu qu'une fois)
    const contentType = response.headers.get('content-type')
    const isJson = contentType && contentType.includes('application/json')
    
    let text = ''
    try {
      text = await response.text()
    } catch (e) {
      throw new Error(`Impossible de lire la réponse de l'endpoint ${path}: ${e.message}`)
    }
    
    // Vérifier le statut HTTP
    if (!response.ok) {
      // Essayer de parser l'erreur JSON
      let errorData = {}
      if (isJson && text && text.trim()) {
        try {
          errorData = JSON.parse(text)
        } catch (e) {
          // Si le parsing échoue, utiliser le texte brut
          console.error('[fetchJson] Erreur parsing JSON erreur:', e)
        }
      }
      
      const errorMessage = errorData.error || errorData.message || errorData.error || `Erreur HTTP ${response.status}`
      const error = new Error(errorMessage)
      
      if (errorData.details) {
        error.details = errorData.details
      }
      if (errorData.code) {
        error.code = errorData.code
      }
      if (errorData.logs) {
        error.logs = errorData.logs
      }
      // Inclure aussi error si présent
      if (errorData.error && errorData.error !== errorMessage) {
        error.error = errorData.error
      }
      
      // Log pour debug
      console.error('[fetchJson] Erreur HTTP:', {
        status: response.status,
        statusText: response.statusText,
        errorData,
        text: text.substring(0, 500)
      })
      
      throw error
    }
    
    // Vérifier que la réponse contient du contenu
    if (!text || !text.trim()) {
      throw new Error(`Réponse vide de l'endpoint ${path}`)
    }
    
    if (!isJson) {
      throw new Error(`Réponse non-JSON de l'endpoint ${path}: ${text.substring(0, 100)}`)
    }
    
    // Parser le JSON
    let data
    try {
      data = JSON.parse(text)
    } catch (parseError) {
      throw new Error(`Réponse JSON invalide de l'endpoint ${path}: ${parseError.message}. Réponse: ${text.substring(0, 200)}`)
    }
    
    // Vérifier le succès de l'opération
    if (!data.success) {
      const errorMessage = data.message || data.error || 'Erreur API'
      const error = new Error(errorMessage)
      if (data.details) {
        error.details = data.details
      }
      if (data.code) {
        error.code = data.code
      }
      if (data.logs) {
        error.logs = data.logs
      }
      // Inclure aussi error si présent
      if (data.error && data.error !== errorMessage) {
        error.error = data.error
      }
      throw error
    }
    
    return data
  } catch (error) {
    // Si c'est déjà une erreur formatée, la renvoyer telle quelle
    if (error.message && error.message.includes('Erreur HTTP')) {
      throw error
    }
    
    // Gérer spécifiquement les erreurs "Failed to fetch" (problème réseau/CORS)
    if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Network request failed'))) {
      const fullUrl = `${API_URL}${path}`
      const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
      
      console.error('[fetchJson] ❌ Erreur réseau/CORS:', {
        url: fullUrl,
        error: error.message,
        apiUrl: API_URL,
        path: path,
        isLocalhost: isLocalhost,
        windowOrigin: typeof window !== 'undefined' ? window.location.origin : 'N/A'
      })
      
      // Message d'erreur plus informatif selon le contexte
      let errorMessage = `Impossible de contacter l'API (${API_URL}).`
      
      if (isLocalhost) {
        errorMessage += ' En local, vérifiez que le serveur Next.js est démarré et que le proxy fonctionne correctement.'
      } else {
        errorMessage += ' Vérifiez votre connexion internet et que l\'API est accessible.'
      }
      
      throw new Error(errorMessage)
    }
    
    // Si c'est déjà une Error, la relancer
    if (error instanceof Error) {
      throw error
    }
    // Sinon, créer une nouvelle Error
    throw new Error(error.message || 'Erreur lors de l\'appel API')
  }
}

