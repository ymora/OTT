/**
 * Utilitaires partagés
 */

/**
 * Ajoute le basePath aux chemins pour GitHub Pages
 * @param {string} path - Le chemin à préfixer
 * @returns {string}
 */
export const withBasePath = (path) => {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''
  if (!path.startsWith('/')) {
    path = `/${path}`
  }
  return `${basePath}${path}`
}

/**
 * Convertit les booléens PostgreSQL en booléen JavaScript
 * PostgreSQL peut retourner true, 't', '1', 1, ou null
 * @param {any} value - La valeur à convertir
 * @returns {boolean}
 */
export const isTrue = (value) => {
  return value === true || value === 't' || value === '1' || value === 1
}

/**
 * Formate une date pour l'affichage
 * @param {string|Date} date - La date à formater
 * @param {Object} options - Options de formatage
 * @returns {string}
 */
export const formatDate = (date, options = {}) => {
  if (!date) return '-'
  const defaultOptions = {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options
  }
  return new Date(date).toLocaleString('fr-FR', defaultOptions)
}

/**
 * Formate une date avec heure pour l'affichage (alias de formatDate)
 * @param {string|Date} date - La date à formater
 * @returns {string}
 */
export const formatDateTime = (date) => {
  return formatDate(date, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Valide un email
 * @param {string} email - L'email à valider
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  return /\S+@\S+\.\S+/.test(email || '')
}

/**
 * Valide un code postal français
 * @param {string} postalCode - Le code postal à valider
 * @returns {boolean}
 */
export const isValidPostalCode = (postalCode) => {
  return /^\d{5}$/.test((postalCode || '').trim())
}

/**
 * Valide un numéro de téléphone français
 * @param {string} phone - Le numéro de téléphone à valider
 * @returns {boolean}
 */
export const isValidPhone = (phone) => {
  if (!phone) return true // Optionnel
  const cleaned = phone.replace(/\s/g, '')
  return /^(\+33|0)[1-9](\d{2}){4}$/.test(cleaned)
}
