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

/**
 * Formate le temps écoulé depuis une date en format lisible
 * @param {string|Date} date - La date de référence
 * @returns {string} - Format: "X jour(s)", "X heure(s)", ou "X min"
 */
export const formatTimeAgo = (date) => {
  if (!date) return 'Jamais vu'
  
  const minutes = Math.round((new Date() - new Date(date)) / (1000 * 60))
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) {
    return `${days} jour${days > 1 ? 's' : ''}`
  } else if (hours > 0) {
    return `${hours} heure${hours > 1 ? 's' : ''}`
  } else {
    return `${minutes} min`
  }
}

/**
 * Vérifie si une entité est archivée (détection robuste)
 * Fonction unifiée pour tous les types d'entités (users, patients, devices, etc.)
 * @param {Object} entity - L'entité à vérifier
 * @returns {boolean} - true si l'entité est archivée
 */
export const isArchived = (entity) => {
  if (!entity) return false
  const deletedAt = entity.deleted_at
  // Vérifier si deleted_at existe et n'est pas null, undefined, ou une chaîne vide
  return deletedAt !== null && deletedAt !== undefined && deletedAt !== '' && String(deletedAt).trim() !== ''
}