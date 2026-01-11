/**
 * API utilitaire hybride - OTT Dashboard
 * Garde la robustesse actuelle avec la simplicité de v1.0-95percent
 * @module lib/api
 */

import logger from './logger'
import { getValidApiUrl } from './config'

/**
 * Fait un appel API et retourne les données JSON
 * Version hybride : robustesse actuelle + simplicité
 * @param {Function} fetchWithAuth - Fonction fetch avec authentification
 * @param {string} path - Chemin de l'endpoint
 * @param {Object} options - Options pour fetch (méthode, body, etc.)
 * @param {Object} config - Configuration (requiresAuth, etc.)
 * @returns {Promise<Object>} Données JSON de la réponse
 * @throws {Error} Si la requête échoue ou si data.success est false
 */
export async function fetchJson(fetchWithAuth, path, options = {}, config = {}) {
  try {
    // URL de base depuis config hybride
    const API_URL = getValidApiUrl()
    
    if (!API_URL || !path) {
      throw new Error(`URL API invalide: API_URL=${API_URL}, path=${path}`)
    }
    
    const fullUrl = `${API_URL}${path}`
    logger.log('API call:', fullUrl)
    
    const response = await fetchWithAuth(fullUrl, options, config)
    
    // Vérifier le statut HTTP
    if (!response.ok) {
      // Essayer de parser l'erreur JSON
      let errorData = {}
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        try {
          const text = await response.text()
          if (text && text.trim()) {
            errorData = JSON.parse(text)
          }
        } catch (e) {
          logger.error('Erreur parsing JSON erreur:', e)
        }
      }
      
      const errorMessage = errorData.error || errorData.message || `Erreur HTTP ${response.status}`
      const error = new Error(errorMessage)
      
      // Ajouter des détails si disponibles
      if (errorData.details) error.details = errorData.details
      if (errorData.code) error.code = errorData.code
      if (errorData.logs) error.logs = errorData.logs
      
      logger.error('API HTTP Error:', {
        status: response.status,
        statusText: response.statusText,
        url: fullUrl,
        error: errorMessage
      })
      
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

    // Lire le texte de la réponse
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
      const errorMessage = data.message || data.error || 'Erreur API'
      const error = new Error(errorMessage)
      
      if (data.details) error.details = data.details
      if (data.code) error.code = data.code
      if (data.logs) error.logs = data.logs
      
      logger.error('API Business Error:', {
        path,
        error: errorMessage,
        data
      })
      
      throw error
    }

    logger.log('API Success:', path)
    return data

  } catch (error) {
    // Si c'est déjà une erreur formatée, la relancer
    if (error.message && (error.message.includes('Erreur HTTP') || error.message.includes('Erreur API'))) {
      throw error
    }
    
    // Gérer spécifiquement les erreurs réseau
    if (error.message && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      const API_URL = getValidApiUrl()
      const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost'
      
      logger.error('API Network Error:', {
        url: `${API_URL}${path}`,
        error: error.message,
        isLocalhost
      })
      
      let errorMessage = `Impossible de contacter l'API (${API_URL}).`
      
      if (isLocalhost) {
        errorMessage += ' Vérifiez que l\'API locale est démarrée sur le port 8080.'
      } else {
        errorMessage += ' Vérifiez votre connexion internet.'
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

/**
 * Fonction simplifiée pour les requêtes GET
 * @param {Function} fetchWithAuth - Fonction fetch avec authentification
 * @param {string} path - Chemin de l'endpoint
 * @param {Object} config - Configuration additionnelle
 * @returns {Promise<Object>} Données JSON
 */
export async function get(fetchWithAuth, path, config = {}) {
  return fetchJson(fetchWithAuth, path, { method: 'GET' }, config)
}

/**
 * Fonction simplifiée pour les requêtes POST
 * @param {Function} fetchWithAuth - Fonction fetch avec authentification
 * @param {string} path - Chemin de l'endpoint
 * @param {Object} data - Données à envoyer
 * @param {Object} config - Configuration additionnelle
 * @returns {Promise<Object>} Données JSON
 */
export async function post(fetchWithAuth, path, data, config = {}) {
  return fetchJson(fetchWithAuth, path, {
    method: 'POST',
    body: JSON.stringify(data)
  }, config)
}

/**
 * Fonction simplifiée pour les requêtes PUT
 * @param {Function} fetchWithAuth - Fonction fetch avec authentification
 * @param {string} path - Chemin de l'endpoint
 * @param {Object} data - Données à envoyer
 * @param {Object} config - Configuration additionnelle
 * @returns {Promise<Object>} Données JSON
 */
export async function put(fetchWithAuth, path, data, config = {}) {
  return fetchJson(fetchWithAuth, path, {
    method: 'PUT',
    body: JSON.stringify(data)
  }, config)
}

/**
 * Fonction simplifiée pour les requêtes DELETE
 * @param {Function} fetchWithAuth - Fonction fetch avec authentification
 * @param {string} path - Chemin de l'endpoint
 * @param {Object} config - Configuration additionnelle
 * @returns {Promise<Object>} Données JSON
 */
export async function del(fetchWithAuth, path, config = {}) {
  return fetchJson(fetchWithAuth, path, { method: 'DELETE' }, config)
}

export default {
  fetchJson,
  get,
  post,
  put,
  delete: del
}
