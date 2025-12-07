/**
 * Hook optimisé pour le rafraîchissement intelligent des dispositifs
 * Combine polling adaptatif + événements + debounce pour éviter les requêtes inutiles
 * @module hooks/useSmartDeviceRefresh
 */

import { useEffect, useRef, useCallback } from 'react'

/**
 * Hook pour rafraîchir intelligemment les dispositifs
 * @param {Function} refetch - Fonction pour recharger les données
 * @param {Object} options - Options de configuration
 * @param {boolean} options.isUsbConnected - Si un dispositif USB est connecté localement
 * @param {boolean} options.enabled - Activer/désactiver le rafraîchissement (défaut: true)
 * @param {number} options.pollingIntervalUsb - Intervalle de polling si USB connecté (défaut: 5000ms)
 * @param {number} options.pollingIntervalWeb - Intervalle de polling si web seulement (défaut: 15000ms)
 * @param {number} options.eventDebounceMs - Debounce pour les événements (défaut: 2000ms)
 */
export function useSmartDeviceRefresh(refetch, options = {}) {
  const {
    isUsbConnected = false,
    enabled = true,
    pollingIntervalUsb = 5000, // 5 secondes si USB connecté (plus fréquent)
    pollingIntervalWeb = 15000, // 15 secondes si web seulement (moins fréquent)
    eventDebounceMs = 2000 // 2 secondes de debounce pour les événements
  } = options

  const refetchRef = useRef(refetch)
  const lastEventTimeRef = useRef(0)
  const debounceTimeoutRef = useRef(null)
  const pollingIntervalRef = useRef(null)

  // Mettre à jour la référence à chaque changement
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  // Fonction de refetch avec debounce pour les événements
  const debouncedRefetch = useCallback(() => {
    const now = Date.now()
    const timeSinceLastEvent = now - lastEventTimeRef.current

    // Si un événement est arrivé récemment (< debounce), on attend
    if (timeSinceLastEvent < eventDebounceMs) {
      // Annuler le timeout précédent
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      // Programmer un nouveau refetch après le debounce
      debounceTimeoutRef.current = setTimeout(() => {
        if (refetchRef.current) {
          refetchRef.current()
        }
        lastEventTimeRef.current = Date.now()
      }, eventDebounceMs - timeSinceLastEvent)
    } else {
      // Refetch immédiatement si pas d'événement récent
      if (refetchRef.current) {
        refetchRef.current()
      }
      lastEventTimeRef.current = now
    }
  }, [eventDebounceMs])

  // Gestionnaire d'événements
  const handleDevicesUpdated = useCallback(() => {
    lastEventTimeRef.current = Date.now()
    debouncedRefetch()
  }, [debouncedRefetch])

  const handleStorageUpdate = useCallback((event) => {
    if (event.key === 'ott-devices-last-update') {
      lastEventTimeRef.current = Date.now()
      debouncedRefetch()
    }
  }, [debouncedRefetch])

  // Polling adaptatif : plus fréquent si USB connecté, moins fréquent si web seulement
  useEffect(() => {
    if (!enabled || !refetchRef.current || typeof window === 'undefined') {
      return
    }

    // Intervalle adaptatif selon le contexte
    const interval = isUsbConnected ? pollingIntervalUsb : pollingIntervalWeb

    // Démarrer le polling
    pollingIntervalRef.current = setInterval(() => {
      // Ne refetch que si pas d'événement récent (évite les refetch redondants)
      const timeSinceLastEvent = Date.now() - lastEventTimeRef.current
      if (timeSinceLastEvent > interval) {
        // Pas d'événement récent, on peut refetch
        if (refetchRef.current) {
          refetchRef.current()
        }
      }
      // Sinon, on attend que le debounce de l'événement se déclenche
    }, interval)

    // Écouter les événements
    window.addEventListener('ott-devices-updated', handleDevicesUpdated)
    window.addEventListener('storage', handleStorageUpdate)

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current)
      }
      window.removeEventListener('ott-devices-updated', handleDevicesUpdated)
      window.removeEventListener('storage', handleStorageUpdate)
    }
  }, [enabled, isUsbConnected, pollingIntervalUsb, pollingIntervalWeb, handleDevicesUpdated, handleStorageUpdate])
}

