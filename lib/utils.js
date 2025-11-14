/**
 * Fonctions utilitaires réutilisables
 * @module lib/utils
 */

/**
 * Formate une date en français
 * @param {string|Date} date - Date à formater
 * @param {Object} options - Options de formatage
 * @returns {string} Date formatée
 */
export function formatDate(date, options = {}) {
  if (!date) return '-'
  
  const defaults = {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }
  
  return new Date(date).toLocaleDateString('fr-FR', { ...defaults, ...options })
}

/**
 * Formate une date et heure en français
 * @param {string|Date} date - Date à formater
 * @returns {string} Date et heure formatées
 */
export function formatDateTime(date) {
  if (!date) return '-'
  
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Calcule le temps écoulé depuis une date (ex: "il y a 2 heures")
 * @param {string|Date} date - Date de référence
 * @returns {string} Temps écoulé
 */
export function timeAgo(date) {
  if (!date) return '-'
  
  const seconds = Math.floor((new Date() - new Date(date)) / 1000)
  
  const intervals = [
    { label: 'an', seconds: 31536000 },
    { label: 'mois', seconds: 2592000 },
    { label: 'jour', seconds: 86400 },
    { label: 'heure', seconds: 3600 },
    { label: 'minute', seconds: 60 },
  ]
  
  for (const interval of intervals) {
    const count = Math.floor(seconds / interval.seconds)
    if (count >= 1) {
      return count === 1 
        ? `il y a 1 ${interval.label}`
        : `il y a ${count} ${interval.label}s`
    }
  }
  
  return 'à l\'instant'
}

/**
 * Vérifie si un dispositif est en ligne (dernière activité < 2h)
 * @param {string|Date} lastSeen - Date de dernière activité
 * @returns {boolean} true si en ligne
 */
export function isDeviceOnline(lastSeen) {
  if (!lastSeen) return false
  
  const hoursSince = (new Date() - new Date(lastSeen)) / (1000 * 60 * 60)
  return hoursSince < 2
}

/**
 * Retourne la couleur en fonction du niveau de batterie
 * @param {number} batteryLevel - Niveau batterie (0-100)
 * @returns {string} Classe CSS Tailwind
 */
export function getBatteryColor(batteryLevel) {
  if (batteryLevel > 60) return 'text-green-600'
  if (batteryLevel > 20) return 'text-orange-600'
  return 'text-red-600'
}

/**
 * Formate un nombre avec séparateurs de milliers
 * @param {number} num - Nombre à formater
 * @returns {string} Nombre formaté
 */
export function formatNumber(num) {
  if (typeof num !== 'number') return '-'
  return num.toLocaleString('fr-FR')
}

/**
 * Tronque un texte avec ellipse
 * @param {string} text - Texte à tronquer
 * @param {number} maxLength - Longueur max
 * @returns {string} Texte tronqué
 */
export function truncate(text, maxLength = 50) {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return text.substring(0, maxLength) + '...'
}

/**
 * Extrait les initiales d'un nom complet
 * @param {string} firstName - Prénom
 * @param {string} lastName - Nom
 * @returns {string} Initiales (ex: "JD")
 */
export function getInitials(firstName, lastName) {
  if (!firstName || !lastName) return '?'
  return (firstName[0] + lastName[0]).toUpperCase()
}

/**
 * Combine des classes CSS avec gestion des conditions
 * @param {...string} classes - Classes CSS
 * @returns {string} Classes combinées
 */
export function cn(...classes) {
  return classes.filter(Boolean).join(' ')
}

