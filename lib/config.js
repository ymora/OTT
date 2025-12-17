/**
 * Configuration centralisée de l'application OTT
 * @module lib/config
 */

// URLs API
export const API_CONFIG = {
  // URL API (auto-détection prod/dev)
  // NOTE: Cette config n'est pas utilisée partout - AuthContext définit sa propre API_URL
  // TODO: Centraliser l'utilisation de cette config dans tout le projet
  BASE_URL: process.env.NEXT_PUBLIC_API_URL || 'https://ott-jbln.onrender.com',
  
  // Endpoints API - Liste complète de tous les endpoints disponibles
  ENDPOINTS: {
    // Authentification
    AUTH_LOGIN: '/api.php/auth/login',
    AUTH_LOGOUT: '/api.php/auth/logout',
    AUTH_ME: '/api.php/auth/me',
    
    // Dispositifs
    DEVICES: '/api.php/devices',
    DEVICE_BY_ID: (id) => `/api.php/devices/${id}`,
    DEVICE_MEASUREMENTS: (id) => `/api.php/devices/${id}/measurements`,
    DEVICE_OTA: (id) => `/api.php/devices/${id}/ota`,
    DEVICE_CONFIG: (id) => `/api.php/devices/${id}/config`,
    DEVICE_TEST_CREATE: '/api.php/devices/test/create',
    DEVICE_ARCHIVE: (id) => `/api.php/devices/${id}?permanent=false`,
    DEVICE_DELETE: (id) => `/api.php/devices/${id}?permanent=true`,
    
    // Patients
    PATIENTS: '/api.php/patients',
    PATIENT_BY_ID: (id) => `/api.php/patients/${id}`,
    PATIENT_NOTIFICATIONS: (id) => `/api.php/patients/${id}/notifications`,
    
    // Utilisateurs
    USERS: '/api.php/users',
    USER_BY_ID: (id) => `/api.php/users/${id}`,
    USER_NOTIFICATIONS: (id) => `/api.php/users/${id}/notifications`,
    ROLES: '/api.php/roles',
    PERMISSIONS: '/api.php/permissions',
    
    // Mesures
    MEASUREMENTS: '/api.php/measurements',
    
    // Alertes
    ALERTS: '/api.php/alerts',
    
    // Firmwares
    FIRMWARES: '/api.php/firmwares',
    FIRMWARE_BY_ID: (id) => `/api.php/firmwares/${id}`,
    FIRMWARE_DOWNLOAD: (id) => `/api.php/firmwares/${id}/download`,
    FIRMWARE_INO: (id) => `/api.php/firmwares/${id}/ino`,
    
    // Migrations (admin)
    MIGRATE: '/api.php/migrate',
    MIGRATIONS_HISTORY: '/api.php/migrations/history',
    MIGRATION_HIDE: (id) => `/api.php/migrations/history/${id}/hide`,
    MIGRATION_DELETE_HISTORY: (id) => `/api.php/migrations/history/${id}`,
    MIGRATION_DELETE_FILE: (filename) => `/api.php/migrations/file/${encodeURIComponent(filename)}`,
    
    // Notifications
    NOTIFICATIONS_PREFERENCES: '/api.php/notifications/preferences',
    NOTIFICATIONS_TEST: '/api.php/notifications/test',
    NOTIFICATIONS_QUEUE: '/api.php/notifications/queue',
    NOTIFICATIONS_PROCESS: '/api.php/notifications/process',
    
    // USB Logs
    USB_LOGS: (deviceId) => `/api.php/usb-logs/${encodeURIComponent(deviceId)}`,
    
    // Audit
    AUDIT: '/api.php/audit',
    AUDIT_CLEAR: '/api.php/audit',
    DATABASE_AUDIT: '/api.php/admin/database-audit',
    
    // Admin
    ADMIN_REPAIR_DATABASE: '/api.php/admin/repair-database',
    ADMIN_MIGRATE_COMPLETE: '/api.php/admin/migrate-complete',
    ADMIN_DIAGNOSTIC_MEASUREMENTS: '/api.php/admin/diagnostic/measurements',
    
    // Documentation
    DOCS: (fileName) => `/api.php/docs/${fileName}`,
    DOCS_REGENERATE_TIME_TRACKING: '/api.php/docs/regenerate-time-tracking',
    
    // Health
    HEALTH: '/api.php/health',
    
    // Logs
    LOGS: '/api.php/logs',
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

