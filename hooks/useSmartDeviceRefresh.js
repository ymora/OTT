import { useEffect, useCallback } from 'react';
import logger from '@/lib/logger';

export function useSmartDeviceRefresh(refetch, options = {}) {
  const {
    isUsbConnected = false,
    enabled = true,
    pollingIntervalUsb = 10000,
    pollingIntervalWeb = 30000,
    eventDebounceMs = 2000
  } = options;

  const pollingInterval = isUsbConnected ? pollingIntervalUsb : pollingIntervalWeb;

  const debouncedRefetch = useCallback(() => {
    if (!refetch) return;
    
    const timer = setTimeout(() => {
      logger.debug('Auto-refreshing device data');
      refetch();
    }, eventDebounceMs);

    return () => clearTimeout(timer);
  }, [refetch, eventDebounceMs]);

  useEffect(() => {
    if (!enabled || !refetch) return;

    const interval = setInterval(debouncedRefetch, pollingInterval);
    return () => clearInterval(interval);
  }, [debouncedRefetch, enabled, pollingInterval, refetch]);
}
