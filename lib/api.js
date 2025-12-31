/**
 * Fonction utilitaire pour faire des appels API avec gestion d'erreurs améliorée
 * @module lib/api
 */

import logger from './logger'

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
          logger.error('[fetchJson] Erreur parsing JSON erreur:', e)
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
      
      // Log pour debug avec plus de détails
      // Vérifier que response existe et a les propriétés attendues
      const status = response?.status ?? 'N/A'
      const statusText = response?.statusText ?? 'N/A'
      
      // Construire errorInfo avec toutes les valeurs (même null/undefined)
      const errorInfo = {
        status: status,
        statusText: statusText,
        url: fullUrl || 'N/A',
        path: path || 'N/A',
        apiUrl: API_URL || 'N/A',
        contentType: contentType || 'N/A',
        isJson: isJson || false,
        errorData: errorData || null,
        errorDataKeys: errorData ? Object.keys(errorData) : [],
        errorDataString: errorData ? JSON.stringify(errorData) : 'null',
        textPreview: text ? text.substring(0, 500) : '(vide)',
        textLength: text ? text.length : 0,
        textFull: text || '(vide)',
        hasResponse: !!response,
        responseOk: response?.ok ?? false,
        responseStatus: response?.status ?? 'N/A',
        responseStatusText: response?.statusText ?? 'N/A',
        responseType: response?.type ?? 'N/A',
        responseUrl: response?.url ?? 'N/A'
      }
      
      // Toujours logger avec toutes les informations
      logger.error('[fetchJson] Erreur HTTP:', JSON.stringify(errorInfo, null, 2))
      logger.error('[fetchJson] Erreur HTTP (objet):', errorInfo)
      
      // Logger aussi les détails de la réponse si disponibles
      if (response) {
        try {
          const headersObj = {}
          if (response.headers && response.headers.entries) {
            for (const [key, value] of response.headers.entries()) {
              headersObj[key] = value
            }
          }
          logger.error('[fetchJson] Détails réponse:', {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            headers: headersObj,
            type: response.type,
            redirected: response.redirected,
            url: response.url
          })
        } catch (e) {
          logger.error('[fetchJson] Erreur lors de l\'extraction des détails réponse:', e)
        }
      } else {
        logger.error('[fetchJson] ⚠️ response est null ou undefined')
      }
      
      // Toujours afficher le texte de la réponse
      logger.error('[fetchJson] Texte de la réponse:', {
        hasText: !!text,
        textLength: text ? text.length : 0,
        textPreview: text ? text.substring(0, 500) : '(vide)',
        textFull: text || '(vide)',
        isJson: isJson
      })
      
      // Si le texte contient des informations utiles, les afficher aussi
      if (text && text.length > 0) {
        if (!isJson) {
          logger.error('[fetchJson] Réponse non-JSON (premiers 1000 caractères):', text.substring(0, 1000))
        } else {
          logger.error('[fetchJson] Réponse JSON (erreur, premiers 1000 caractères):', text.substring(0, 1000))
          try {
            const parsed = JSON.parse(text)
            logger.error('[fetchJson] Réponse JSON parsée:', parsed)
          } catch (e) {
            logger.error('[fetchJson] Impossible de parser le JSON:', e)
          }
        }
      } else {
        logger.error('[fetchJson] ⚠️ Réponse vide (pas de texte)')
      }
      
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
      
      logger.error('[fetchJson] ❌ Erreur réseau/CORS:', {
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
        // En localhost, si NEXT_PUBLIC_API_URL pointe vers localhost:8000, c'est normal si l'API n'est pas démarrée
        if (API_URL.includes('localhost:8000')) {
          errorMessage += ' L\'API locale n\'est probablement pas démarrée. Démarrez le serveur PHP sur le port 8000 ou utilisez le proxy Next.js.'
        } else {
          errorMessage += ' En local, vérifiez que le serveur Next.js est démarré et que le proxy fonctionne correctement.'
        }
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

