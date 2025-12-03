/**
 * Point d'entrée pour tous les hooks personnalisés
 * @module hooks
 */

export { useApiData } from './useApiData'
export { useDebounce } from './useDebounce'
export { useFilter } from './useFilter'
export { useUsbAutoDetection } from './useUsbAutoDetection'
export { useEntityModal } from './useEntityModal'
export { useEntityDelete } from './useEntityDelete'
export { useAutoRefresh } from './useAutoRefresh'
export { useDevicesUpdateListener } from './useDevicesUpdateListener'

// Nouveaux hooks pour réduire la duplication de code
export { useToggle } from './useToggle'
export { useFormState } from './useFormState'
export { useAsync } from './useAsync'
export { useLocalStorage } from './useLocalStorage'

