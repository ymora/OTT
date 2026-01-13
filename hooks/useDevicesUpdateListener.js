/**
 * Hook personnalisé pour écouter les événements de mise à jour des dispositifs
 * Élimine la duplication de code pour les listeners d'événements
 * @module hooks/useDevicesUpdateListener
 */

import { useEffect, useRef } from 'react'

/**
 * Hook pour écouter les événements de mise à jour des dispositifs
 * @param {Function} refetch - Fonction pour recharger les données
 * @param {boolean} enabled - Activer/désactiver l'écoute (défaut: true)
 */
export function useDevicesUpdateListener(refetch, enabled = true) {
  const refetchRef = useRef(refetch)
  
  // Mettre à jour la référence à chaque changement
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])
  
  useEffect(() => {
    if (!enabled || !refetchRef.current || typeof window === 'undefined') return

    const handleDevicesUpdated = () => {
      refetchRef.current()
    }

    const handleStorageUpdate = (event) => {
      if (event.key === 'ott-devices-last-update') {
        refetchRef.current()
      }
    }

    window.addEventListener('ott-devices-updated', handleDevicesUpdated)
    window.addEventListener('storage', handleStorageUpdate)

    return () => {
      window.removeEventListener('ott-devices-updated', handleDevicesUpdated)
      window.removeEventListener('storage', handleStorageUpdate)
    }
  }, [enabled]) // Ne pas inclure refetch pour éviter les boucles
}

