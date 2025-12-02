/**
 * Utilitaires de formatage de dates
 * Centralise le formatage de dates pour éviter les duplications
 */

/**
 * Formate une date au format français complet (date + heure)
 * @param {string|Date} dateString - Date à formater
 * @param {Object} options - Options de formatage
 * @returns {string} Date formatée ou '-' si invalide
 */
export function formatDateTime(dateString, options = {}) {
  if (!dateString) return '-'
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    
    if (isNaN(date.getTime())) {
      return '-'
    }
    
    const {
      showTime = true,
      showSeconds = false,
      locale = 'fr-FR'
    } = options
    
    const formatOptions = {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      ...(showTime && {
        hour: '2-digit',
        minute: '2-digit',
        ...(showSeconds && { second: '2-digit' })
      })
    }
    
    return date.toLocaleString(locale, formatOptions)
  } catch (error) {
    console.error('[dateUtils] Erreur formatage date:', error)
    return '-'
  }
}

/**
 * Formate une date au format français (date uniquement, sans heure)
 * @param {string|Date} dateString - Date à formater
 * @returns {string} Date formatée ou '-' si invalide
 */
export function formatDateOnly(dateString) {
  return formatDateTime(dateString, { showTime: false })
}

/**
 * Formate une date avec heure (format court)
 * @param {string|Date} dateString - Date à formater
 * @returns {string} Date formatée ou '-' si invalide
 */
export function formatDate(dateString) {
  return formatDateTime(dateString, { showTime: true, showSeconds: false })
}

/**
 * Formate une date relative (ex: "il y a 2 heures")
 * @param {string|Date} dateString - Date à formater
 * @returns {string} Date relative ou date formatée si trop ancienne
 */
export function formatRelativeDate(dateString) {
  if (!dateString) return '-'
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    
    if (isNaN(date.getTime())) {
      return '-'
    }
    
    const now = new Date()
    const diffMs = now - date
    const diffSeconds = Math.floor(diffMs / 1000)
    const diffMinutes = Math.floor(diffSeconds / 60)
    const diffHours = Math.floor(diffMinutes / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffSeconds < 60) {
      return 'À l\'instant'
    } else if (diffMinutes < 60) {
      return `Il y a ${diffMinutes} minute${diffMinutes > 1 ? 's' : ''}`
    } else if (diffHours < 24) {
      return `Il y a ${diffHours} heure${diffHours > 1 ? 's' : ''}`
    } else if (diffDays < 7) {
      return `Il y a ${diffDays} jour${diffDays > 1 ? 's' : ''}`
    } else {
      // Si plus d'une semaine, retourner la date formatée
      return formatDateTime(dateString)
    }
  } catch (error) {
    console.error('[dateUtils] Erreur formatage date relative:', error)
    return '-'
  }
}

/**
 * Vérifie si une date est valide
 * @param {string|Date} dateString - Date à vérifier
 * @returns {boolean} True si la date est valide
 */
export function isValidDate(dateString) {
  if (!dateString) return false
  
  try {
    const date = typeof dateString === 'string' ? new Date(dateString) : dateString
    return !isNaN(date.getTime())
  } catch {
    return false
  }
}

