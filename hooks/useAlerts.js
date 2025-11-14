/**
 * Hook personnalisé pour gérer les alertes
 * @module hooks/useAlerts
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { API_CONFIG, REFRESH_INTERVALS } from '@/lib/config'

export function useAlerts(options = {}) {
  const { fetchWithAuth, API_URL } = useAuth()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const { 
    autoLoad = true, 
    autoRefresh = false,
    filter = null // { status: 'unresolved', severity: 'critical' }
  } = options

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      let url = `${API_URL}${API_CONFIG.ENDPOINTS.ALERTS}`
      
      // Ajout filtres query params
      if (filter) {
        const params = new URLSearchParams(filter)
        url += `?${params.toString()}`
      }
      
      const response = await fetchWithAuth(url)
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Erreur chargement alertes')
      }
      
      setAlerts(data.alerts || [])
    } catch (err) {
      setError(err.message)
      console.error('Erreur useAlerts:', err)
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, API_URL, filter])

  useEffect(() => {
    if (autoLoad) {
      loadAlerts()
    }
  }, [autoLoad, loadAlerts])

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(loadAlerts, REFRESH_INTERVALS.ALERTS)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, loadAlerts])

  const unresolvedCount = alerts.filter(a => a.status === 'unresolved').length
  const criticalCount = alerts.filter(a => a.severity === 'critical' && a.status === 'unresolved').length

  return {
    alerts,
    loading,
    error,
    reload: loadAlerts,
    unresolvedCount,
    criticalCount,
  }
}

