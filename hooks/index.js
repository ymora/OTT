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
export { useAsyncState } from './useAsyncState'
export { useTimeout, createTimeout } from './useTimeout'
export { useTimeout as useTimerTimeout, useInterval as useTimerInterval, useTimers } from './useTimer'
export { useEntityRestore } from './useEntityRestore'
export { useEntityArchive } from './useEntityArchive'
export { useEntityPermanentDelete } from './useEntityPermanentDelete'
export { useEntityPage } from './useEntityPage'
export { useActionState } from './useActionState'
export { useToggleState } from './useToggleState'
export { useSmartDeviceRefresh } from './useSmartDeviceRefresh'
export { useApiCall } from './useApiCall'
export { useModalState } from './useModalState'
export { useGeolocation } from './useGeolocation'

