/**
 * Hook personnalisé pour le rafraîchissement automatique des données
 * Élimine la duplication de code pour les intervalles de rafraîchissement
 * @module hooks/useAutoRefresh
 */

import { useEffect } from 'react'

/**
 * Hook pour rafraîchir automatiquement les données à intervalles réguliers
 * @param {Function} refetch - Fonction pour recharger les données
 * @param {number} intervalMs - Intervalle en millisecondes (défaut: 30000 = 30 secondes)
 * @param {boolean} enabled - Activer/désactiver le rafraîchissement automatique (défaut: true)
 */
export function useAutoRefresh(refetch, intervalMs = 30000, enabled = true) {
  useEffect(() => {
    if (!enabled || !refetch) return

    const interval = setInterval(() => {
      refetch()
    }, intervalMs)
    
    return () => clearInterval(interval)
  }, [refetch, intervalMs, enabled])
}

