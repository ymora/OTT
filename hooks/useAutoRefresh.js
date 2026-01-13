/**
 * Hook personnalisé pour le rafraîchissement automatique des données
 * Élimine la duplication de code pour les intervalles de rafraîchissement
 * @module hooks/useAutoRefresh
 */

import { useEffect, useRef } from 'react'

/**
 * Hook pour rafraîchir automatiquement les données à intervalles réguliers
 * @param {Function} refetch - Fonction pour recharger les données
 * @param {number} intervalMs - Intervalle en millisecondes (défaut: 30000 = 30 secondes)
 * @param {boolean} enabled - Activer/désactiver le rafraîchissement automatique (défaut: true)
 */
export function useAutoRefresh(refetch, intervalMs = 30000, enabled = true) {
  const refetchRef = useRef(refetch)
  
  // Mettre à jour la référence à chaque changement
  useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])
  
  useEffect(() => {
    if (!enabled || !refetchRef.current) return

    const interval = setInterval(() => {
      refetchRef.current()
    }, intervalMs)
    
    return () => clearInterval(interval)
  }, [intervalMs, enabled]) // Ne pas inclure refetch pour éviter les boucles
}

