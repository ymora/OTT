/**
 * Système de logging conditionnel pour remplacer console.log en production
 */

const isDev = process.env.NODE_ENV !== 'production'

export const logger = {
  log: (...args) => {
    if (isDev) {
      console.log('[LOG]', ...args)
    }
  },
  
  error: (...args) => {
    // Les erreurs sont toujours loggées
    console.error('[ERROR]', ...args)
  },
  
  warn: (...args) => {
    if (isDev) {
      console.warn('[WARN]', ...args)
    }
  },
  
  debug: (...args) => {
    if (isDev && process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.debug('[DEBUG]', ...args)
    }
  }
}

export default logger

