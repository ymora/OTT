/**
 * Hook personnalisé pour écouter les événements de mise à jour des dispositifs
 * Élimine la duplication de code pour les listeners d'événements
 * @module hooks/useDevicesUpdateListener
 */

import { useEffect } from 'react'

/**
 * Hook pour écouter les événements de mise à jour des dispositifs
 * @param {Function} refetch - Fonction pour recharger les données
 * @param {boolean} enabled - Activer/désactiver l'écoute (défaut: true)
 */
export function useDevicesUpdateListener(refetch, enabled = true) {
  useEffect(() => {
    if (!enabled || !refetch || typeof window === 'undefined') return

    const handleDevicesUpdated = () => {
      refetch()
    }

    const handleStorageUpdate = (event) => {
      if (event.key === 'ott-devices-last-update') {
        refetch()
      }
    }

    window.addEventListener('ott-devices-updated', handleDevicesUpdated)
    window.addEventListener('storage', handleStorageUpdate)

    return () => {
      window.removeEventListener('ott-devices-updated', handleDevicesUpdated)
      window.removeEventListener('storage', handleStorageUpdate)
    }
  }, [refetch, enabled])
}

