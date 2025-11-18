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
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `Erreur HTTP ${response.status}`)
    }
    
  const data = await response.json()
    
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

