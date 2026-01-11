/**
 * Export centralisé de tous les hooks custom
 * Facilite les imports et évite la duplication
 */

// Vérification que useToggle est bien disponible
try {
  require.resolve('./useToggle')
} catch (e) {
  throw new Error('useToggle hook is missing. Please create hooks/useToggle.js')
}

// Hooks essentiels restants
export { useApiCall } from './useApiCall'
export { useApiData } from './useApiData'
export { useAsync } from './useAsync'
export { useDebounce } from './useDebounce'
export { useFormState } from './useFormState'
export { useTimeout } from './useTimeout'
export { useToggle } from './useToggle'
export { useAutoRefresh } from './useAutoRefresh'
