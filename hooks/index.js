/**
 * Export centralisé de tous les hooks custom
 * Facilite les imports et évite la duplication
 */

// Hooks existants
export { useActionState } from './useActionState'
export { useApiCall } from './useApiCall'
export { useApiData } from './useApiData'
export { useAsync } from './useAsync'
export { useAsyncState } from './useAsyncState'
export { useAutoRefresh } from './useAutoRefresh'
export { useDebounce } from './useDebounce'
export { useDevicesUpdateListener } from './useDevicesUpdateListener'
export { useEntityArchive } from './useEntityArchive'
export { useEntityDelete } from './useEntityDelete'
export { useEntityModal } from './useEntityModal'
export { useEntityPage } from './useEntityPage'
export { useEntityPermanentDelete } from './useEntityPermanentDelete'
export { useEntityRestore } from './useEntityRestore'
export { useFilter } from './useFilter'
export { useFormState } from './useFormState'
export { useGeolocation } from './useGeolocation'
export { useLocalStorage } from './useLocalStorage'
export { useSmartDeviceRefresh } from './useSmartDeviceRefresh'
export { useTimer } from './useTimer'
export { useTimers } from './useTimers'
export { useToggle } from './useToggle'
export { useToggleState } from './useToggleState'
export { useUsbAutoDetection } from './useUsbAutoDetection'

// Nouveaux hooks (refactoring)
export { useTimeout } from './useTimeout'
export { useModalState } from './useModalState'
export { useDeviceSelection } from './useDeviceSelection'
export { usePaginatedData } from './usePaginatedData'
