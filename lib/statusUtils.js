/**
 * Utilitaires pour les couleurs et badges de status
 * Centralise les définitions de couleurs pour éviter les duplications
 */

// Couleurs de status pour les commandes
export const COMMAND_STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  executed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  error: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-200 text-gray-700'
}

// Couleurs de status pour les dispositifs
export const DEVICE_STATUS_COLORS = {
  active: 'badge-success',
  inactive: 'bg-gray-100 text-gray-600',
  maintenance: 'bg-yellow-100 text-yellow-700'
}

// Couleurs de sévérité pour les alertes
export const ALERT_SEVERITY_COLORS = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
  medium: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

// Couleurs de status pour les alertes
export const ALERT_STATUS_COLORS = {
  resolved: 'badge-success',
  acknowledged: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  unresolved: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
}

// Couleurs pour les rôles
export const ROLE_COLORS = {
  admin: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  medecin: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  technicien: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  viewer: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
}

// Couleurs de status pour les firmwares
export const FIRMWARE_STATUS_COLORS = {
  compiled: 'badge-success',
  compiling: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  error: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  pending_compilation: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
}

/**
 * Retourne la classe CSS pour un status de commande
 * @param {string} status - Status de la commande
 * @returns {string} Classe CSS
 */
export function getCommandStatusColor(status) {
  return COMMAND_STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'
}

/**
 * Retourne la classe CSS pour un status de dispositif
 * @param {string} status - Status du dispositif
 * @returns {string} Classe CSS
 */
export function getDeviceStatusColor(status) {
  return DEVICE_STATUS_COLORS[status] || DEVICE_STATUS_COLORS.inactive
}

/**
 * Retourne la classe CSS pour une sévérité d'alerte
 * @param {string} severity - Sévérité de l'alerte
 * @returns {string} Classe CSS
 */
export function getAlertSeverityColor(severity) {
  return ALERT_SEVERITY_COLORS[severity] || ALERT_SEVERITY_COLORS.low
}

/**
 * Retourne la classe CSS pour un status d'alerte
 * @param {string} status - Status de l'alerte
 * @returns {string} Classe CSS
 */
export function getAlertStatusColor(status) {
  return ALERT_STATUS_COLORS[status] || ALERT_STATUS_COLORS.unresolved
}

/**
 * Retourne la classe CSS pour un rôle
 * @param {string} role - Nom du rôle
 * @returns {string} Classe CSS
 */
export function getRoleColor(role) {
  return ROLE_COLORS[role] || ROLE_COLORS.viewer
}

/**
 * Retourne la classe CSS pour un status de firmware
 * @param {string} status - Status du firmware
 * @returns {string} Classe CSS
 */
export function getFirmwareStatusColor(status) {
  return FIRMWARE_STATUS_COLORS[status] || 'bg-gray-100 text-gray-700'
}

/**
 * Retourne la classe CSS pour un status générique
 * @param {string} type - Type de status ('command', 'device', 'alert', 'role', 'firmware')
 * @param {string} status - Valeur du status
 * @returns {string} Classe CSS
 */
export function getStatusColor(type, status) {
  switch (type) {
    case 'command':
      return getCommandStatusColor(status)
    case 'device':
      return getDeviceStatusColor(status)
    case 'alert-severity':
      return getAlertSeverityColor(status)
    case 'alert-status':
      return getAlertStatusColor(status)
    case 'role':
      return getRoleColor(status)
    case 'firmware':
      return getFirmwareStatusColor(status)
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

