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
    const response = await fetchWithAuth(`${API_URL}${path}`, options, config)
    
    // Vérifier le statut HTTP
    if (!response.ok) {
      // Essayer de parser l'erreur JSON, sinon utiliser le texte brut
      let errorData = {}
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        try {
          const text = await response.text()
          if (text && text.trim()) {
            errorData = JSON.parse(text)
          }
        } catch (e) {
          // Ignorer l'erreur de parsing
        }
      }
      const errorMessage = errorData.error || errorData.message || `Erreur HTTP ${response.status}`
      const error = new Error(errorMessage)
      if (errorData.details) {
        error.details = errorData.details
      }
      if (errorData.code) {
        error.code = errorData.code
      }
      throw error
    }
    
    // Vérifier que la réponse contient du contenu
    const contentType = response.headers.get('content-type')
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text()
      if (!text || !text.trim()) {
        throw new Error(`Réponse vide de l'endpoint ${path}`)
      }
      throw new Error(`Réponse non-JSON de l'endpoint ${path}: ${text.substring(0, 100)}`)
    }
    
    // Lire le texte de la réponse d'abord pour vérifier qu'il n'est pas vide
    const text = await response.text()
    if (!text || !text.trim()) {
      throw new Error(`Réponse JSON vide de l'endpoint ${path}`)
    }
    
    // Parser le JSON
    let data
    try {
      data = JSON.parse(text)
    } catch (parseError) {
      throw new Error(`Réponse JSON invalide de l'endpoint ${path}: ${parseError.message}`)
    }
    
    // Vérifier le succès de l'opération
    if (!data.success) {
      throw new Error(data.error || 'Erreur API')
    }
    
    return data
  } catch (error) {
    // Si c'est déjà une Error, la relancer
    if (error instanceof Error) {
      throw error
    }
    // Sinon, créer une nouvelle Error
    throw new Error(error.message || 'Erreur lors de l\'appel API')
  }
}

