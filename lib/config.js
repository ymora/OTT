/**
 * Configuration hybride - OTT Dashboard
 * Garde la robustesse actuelle avec la simplicité de v1.0-95percent
 */

import logger from './logger'

/**
 * URL de l'API selon l'environnement
 * Docker local : http://localhost:8080
 * Render production : https://ott-jbln.onrender.com
 */
const API_URL = (() => {
  // Priorité 1: Variable d'environnement explicite
  if (process.env.NEXT_PUBLIC_API_URL) {
    const url = process.env.NEXT_PUBLIC_API_URL.trim()
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      logger.log('API_URL depuis env:', url)
      return url
    }
  }
  
  // Priorité 2: Détection automatique localhost
  if (typeof window !== 'undefined') {
    const isLocalhost = window.location.hostname === 'localhost' || 
                       window.location.hostname === '127.0.0.1'
    if (isLocalhost) {
      const localUrl = 'http://localhost:8080'
      logger.log('API_URL localhost détecté:', localUrl)
      return localUrl
    }
  }
  
  // Priorité 3: Production par défaut
  const prodUrl = 'https://ott-jbln.onrender.com'
  logger.log('API_URL production par défaut:', prodUrl)
  return prodUrl
})()

/**
 * Fonction robuste pour obtenir l'URL de l'API
 * @returns {string} URL valide de l'API
 */
export const getValidApiUrl = () => {
  try {
    if (!API_URL) {
      throw new Error('API_URL est indéfini')
    }
    
    // Validation basique mais efficace
    const url = new URL(API_URL)
    logger.log('API_URL validé:', url.toString())
    return url.toString()
  } catch (error) {
    logger.error('Erreur API_URL, fallback sur production:', error)
    return 'https://ott-jbln.onrender.com'
  }
}

export const API_CONFIG = {
  BASE_URL: getValidApiUrl(),
  ENDPOINTS: {
    HEALTH: '/api.php/health',
    DEVICES: '/api.php/devices',
    FIRMWARES: '/api.php/firmwares',
    AUTH: '/api.php/auth',
    PATIENTS: '/api.php/patients',
    ALERTS: '/api.php/alerts',
    USB_LOGS: '/api.php/usb_logs'
  }
}

export const APP_INFO = {
  NAME: 'OTT Dashboard',
  VERSION: '3.1.0-stable',
  COMPANY: 'HAPPLYZ MEDICAL SAS'
}

export default {
  API_URL: getValidApiUrl(),
  API_CONFIG,
  APP_INFO
}
