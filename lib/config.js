/**
 * Configuration centralisée de l'application OTT
 * @module lib/config
 */

// URLs API
export const API_CONFIG = {
  // URL API (auto-détection prod/dev)
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'https://ott-jbln.onrender.com',
  
  // Endpoints
  ENDPOINTS: {
    AUTH_LOGIN: '/api.php/auth/login',
    DEVICES: '/api.php/devices',
    PATIENTS: '/api.php/patients',
    MEASUREMENTS: '/api.php/measurements',
    ALERTS: '/api.php/alerts',
    USERS: '/api.php/users',
    FIRMWARES: '/api.php/firmwares',
    AUDIT: '/api.php/audit',
    OTA: '/api.php/devices/:id/ota',
    CONFIG: '/api.php/devices/:id/config',
  }
}

// Configuration JWT
export const JWT_CONFIG = {
  TOKEN_KEY: 'ott_token',
  USER_KEY: 'ott_user',
  TOKEN_EXPIRY: 24 * 60 * 60 * 1000, // 24h en ms
}

// Configuration pagination
export const PAGINATION = {
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
}

// Sévérités alertes
export const ALERT_SEVERITY = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
}

// Couleurs par sévérité
export const ALERT_COLORS = {
  [ALERT_SEVERITY.CRITICAL]: {
    bg: 'bg-red-50',
    border: 'border-red-500',
    text: 'text-red-700',
    icon: '🚨'
  },
  [ALERT_SEVERITY.HIGH]: {
    bg: 'bg-orange-50',
    border: 'border-orange-500',
    text: 'text-orange-700',
    icon: '⚠️'
  },
  [ALERT_SEVERITY.MEDIUM]: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-500',
    text: 'text-yellow-700',
    icon: '⚡'
  },
  [ALERT_SEVERITY.LOW]: {
    bg: 'bg-blue-50',
    border: 'border-blue-500',
    text: 'text-blue-700',
    icon: 'ℹ️'
  },
}

// Rôles utilisateurs
export const USER_ROLES = {
  ADMIN: 'admin',
  MEDECIN: 'medecin',
  TECHNICIEN: 'technicien',
  // VIEWER supprimé - utiliser MEDECIN pour lecture seule
}

// Permissions
export const PERMISSIONS = {
  DEVICES_VIEW: 'devices.view',
  DEVICES_EDIT: 'devices.edit',
  DEVICES_DELETE: 'devices.delete',
  DEVICES_OTA: 'devices.ota',
  DEVICES_CONFIGURE: 'devices.configure',
  PATIENTS_VIEW: 'patients.view',
  PATIENTS_EDIT: 'patients.edit',
  PATIENTS_DELETE: 'patients.delete',
  USERS_VIEW: 'users.view',
  USERS_EDIT: 'users.edit',
  USERS_DELETE: 'users.delete',
  USERS_MANAGE: 'users.manage',
  USERS_ROLES: 'users.roles',
  ALERTS_VIEW: 'alerts.view',
  ALERTS_EDIT: 'alerts.edit',
  REPORTS_VIEW: 'reports.view',
  REPORTS_EXPORT: 'reports.export',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_VIEW: 'settings.view',
}

// Durées refresh
export const REFRESH_INTERVALS = {
  DASHBOARD: 30000, // 30s
  DEVICES: 60000, // 1min
  ALERTS: 15000, // 15s
}

// Application info
export const APP_INFO = {
  NAME: 'OTT Dashboard',
  VERSION: '3.1.0',
  COMPANY: 'HAPPLYZ MEDICAL SAS',
  SUPPORT_EMAIL: 'support@happlyz.com',
  GITHUB_REPO: 'https://github.com/ymora/OTT',
}

