/**
 * Hook personnalisé pour gérer les dispositifs
 * @module hooks/useDevices
 */

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { API_CONFIG } from '@/lib/config'

export function useDevices(options = {}) {
  const { fetchWithAuth, API_URL } = useAuth()
  const [devices, setDevices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  
  const { autoLoad = true, refreshInterval = null } = options

  const loadDevices = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetchWithAuth(`${API_URL}${API_CONFIG.ENDPOINTS.DEVICES}`)
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Erreur chargement dispositifs')
      }
      
      setDevices(data.devices || [])
    } catch (err) {
      setError(err.message)
      console.error('Erreur useDevices:', err)
    } finally {
      setLoading(false)
    }
  }, [fetchWithAuth, API_URL])

  useEffect(() => {
    if (autoLoad) {
      loadDevices()
    }
  }, [autoLoad, loadDevices])

  useEffect(() => {
    if (refreshInterval) {
      const interval = setInterval(loadDevices, refreshInterval)
      return () => clearInterval(interval)
    }
  }, [refreshInterval, loadDevices])

  return {
    devices,
    loading,
    error,
    reload: loadDevices,
    setDevices, // Pour mises à jour optimistes
  }
}

export function useDevice(deviceId) {
  const { fetchWithAuth, API_URL } = useAuth()
  const [device, setDevice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const loadDevice = useCallback(async () => {
    if (!deviceId) return
    
    try {
      setLoading(true)
      setError(null)
      
      const response = await fetchWithAuth(`${API_URL}${API_CONFIG.ENDPOINTS.DEVICES}/${deviceId}`)
      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Erreur chargement dispositif')
      }
      
      setDevice(data.device)
    } catch (err) {
      setError(err.message)
      console.error('Erreur useDevice:', err)
    } finally {
      setLoading(false)
    }
  }, [deviceId, fetchWithAuth, API_URL])

  useEffect(() => {
    loadDevice()
  }, [loadDevice])

  return { device, loading, error, reload: loadDevice }
}

