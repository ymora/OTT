'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import logger from '@/lib/logger'
import { getValidApiUrl } from '@/lib/config'

/**
 * Contexte d'authentification pour l'application
 * Gère l'état de l'utilisateur et du token
 * @module contexts/AuthContext
 * @returns {React.Context} Le contexte d'authentification
 */
const AuthContext = createContext()

/**
 * URL de l'API - Version hybride simplifiée
 * Utilise la configuration centralisée robuste
 */
const API_URL = getValidApiUrl()

/**
 * Provider du contexte d'authentification
 * @param {Object} props - Props du composant
 * @param {React.ReactNode} props.children - Enfants du composant
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  /**
   * Fonction fetch avec authentification
   * @param {string} url - URL de la requête
   * @param {Object} options - Options de fetch
   * @returns {Promise<Response>} Response de fetch
   */
  const fetchWithAuth = async (url, options = {}) => {
    try {
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers
      }

      if (token) {
        headers.Authorization = `Bearer ${token}`
      }

      const response = await fetch(url, {
        ...options,
        headers
      })

      return response
    } catch (error) {
      logger.error('fetchWithAuth error:', error)
      throw error
    }
  }

  /**
   * Connexion de l'utilisateur
   * @param {Object} credentials - Identifiants de connexion
   * @returns {Promise<Object>} Utilisateur connecté
   */
  const login = async (credentials) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetchWithAuth(`${API_URL}/api.php/auth/login`, {
        method: 'POST',
        body: JSON.stringify(credentials)
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erreur de connexion')
      }

      const { user: userData, token: userToken } = data.data

      setUser(userData)
      setToken(userToken)

      // Sauvegarde dans localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('ott_token', userToken)
        localStorage.setItem('ott_user', JSON.stringify(userData))
      }

      logger.log('Utilisateur connecté:', userData.email)
      return userData

    } catch (error) {
      logger.error('Login error:', error)
      setError(error.message)
      throw error
    } finally {
      setLoading(false)
    }
  }

  /**
   * Déconnexion de l'utilisateur
   */
  const logout = async () => {
    try {
      if (token) {
        await fetchWithAuth(`${API_URL}/api.php/auth/logout`, {
          method: 'POST'
        })
      }
    } catch (error) {
      logger.error('Logout error:', error)
    } finally {
      setUser(null)
      setToken(null)
      setError(null)

      // Nettoyage localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('ott_token')
        localStorage.removeItem('ott_user')
      }

      logger.log('Utilisateur déconnecté')
    }
  }

  /**
   * Vérification du token au démarrage
   */
  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (typeof window !== 'undefined') {
          const savedToken = localStorage.getItem('ott_token')
          const savedUser = localStorage.getItem('ott_user')

          if (savedToken && savedUser) {
            // Validation du token côté serveur
            const response = await fetchWithAuth(`${API_URL}/api.php/auth/verify`, {
              method: 'POST'
            })

            if (response.ok) {
              const data = await response.json()
              if (data.success) {
                setToken(savedToken)
                setUser(JSON.parse(savedUser))
                logger.log('Authentification restaurée')
              } else {
                // Token invalide, nettoyage
                localStorage.removeItem('ott_token')
                localStorage.removeItem('ott_user')
              }
            }
          }
        }
      } catch (error) {
        logger.error('Auth check error:', error)
        // En cas d'erreur, on nettoie tout
        if (typeof window !== 'undefined') {
          localStorage.removeItem('ott_token')
          localStorage.removeItem('ott_user')
        }
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const value = {
    user,
    token,
    loading,
    error,
    login,
    logout,
    fetchWithAuth,
    API_URL
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook pour utiliser le contexte d'authentification
 * @returns {Object} Valeurs du contexte
 */
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider')
  }
  return context
}

export default AuthContext
