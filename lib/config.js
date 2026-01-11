/**
 * Configuration simple - OTT Dashboard
 * Docker local : http://localhost:8080
 * Render production : https://ott-jbln.onrender.com
 */

// URL simple selon l'environnement
const API_URL = process.env.NEXT_PUBLIC_API_URL || 
  (typeof window !== 'undefined' && window.location.hostname === 'localhost' 
    ? 'http://localhost:8080' 
    : 'https://ott-jbln.onrender.com')

// Ensure API_URL always has a value
export const getValidApiUrl = () => {
  return API_URL || 'https://ott-jbln.onrender.com';
}

export const API_CONFIG = {
  BASE_URL: getValidApiUrl(),
  ENDPOINTS: {
    HEALTH: '/api.php/health',
    DEVICES: '/api.php/devices',
    FIRMWARES: '/api.php/firmwares',
    // Ajoute d'autres endpoints si besoin
  }
}

export const APP_INFO = {
  NAME: 'OTT Dashboard',
  VERSION: '3.1.0',
  COMPANY: 'HAPPLYZ MEDICAL SAS'
}
