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
 * URL de l'API - Utilise la configuration centralisée
 * Si NEXT_PUBLIC_API_URL est défini, l'utiliser directement
 * Sinon, en localhost, utiliser le proxy Next.js (URL relative vide = utilise le proxy)
 * En production, utiliser l'URL de production (Render)
 * @type {string}
 */
const API_URL = (() => {
  // Priorité 1: Variable d'environnement explicite (utilisée si définie)
  if (process.env.NEXT_PUBLIC_API_URL) {
    console.log('[AuthContext] NEXT_PUBLIC_API_URL trouvé:', process.env.NEXT_PUBLIC_API_URL)
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  }
  
  // Priorité 2: En localhost, utiliser directement l'API locale
  // Le proxy Next.js ne fonctionne pas correctement dans Docker
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    console.log('[AuthContext] Utilisation directe de localhost:8080')
    return 'http://localhost:8080'
  }
  
  // Priorité 3: Utiliser la configuration centralisée
  console.log('[AuthContext] Utilisation de la configuration centralisée')
  return getValidApiUrl()
})()

/**
 * Vérifie si une URL est absolue
 * @param {string} url - L'URL à vérifier
 * @returns {boolean} True si l'URL est absolue, false sinon
 */
const isAbsoluteUrl = url => /^https?:\/\//i.test(url)

/**
 * Construit une URL absolue pour l'API
 * @param {string} input - L'URL à construire
 * @returns {string} L'URL absolue
 */
const buildAbsoluteApiUrl = (input = '') => {
  if (!input) return API_URL || ''
  if (isAbsoluteUrl(input)) return input
  // Si API_URL est vide (proxy Next.js), utiliser l'URL relative directement
  if (!API_URL && input.startsWith('/')) return input
  if (input.startsWith('/')) return `${API_URL}${input}`
  return `${API_URL}/${input}`
}

/**
 * Construit une URL absolue pour l'API côté client
 * @param {string} input - L'URL à construire
 * @returns {string} L'URL absolue
 */
const buildClientApiUrl = input => buildAbsoluteApiUrl(input)
// Authentification toujours requise
const REQUIRE_AUTH = true

/**
 * Hook personnalisé pour accéder à l'état d'authentification
 * @returns {{ user: object|null, token: string|null, loading: boolean }} Objet contenant l'utilisateur, le token et l'état de chargement
 */
export const useAuthState = () => {
  const [user, setUser] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window?.localStorage) {
        const storedUser = window.localStorage.getItem('ott_user')
        if (storedUser) {
          return JSON.parse(storedUser)
        }
      }
    } catch (e) {
      logger.error('[AuthContext] Erreur accès localStorage:', e)
    }
    return null
  });
  const [token, setToken] = useState(() => {
    try {
      if (typeof window !== 'undefined' && window?.localStorage) {
        return window.localStorage.getItem('ott_token')
      }
    } catch (e) {
      logger.error('[AuthContext] Erreur accès localStorage:', e)
    }
    return null
  });
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Logging pour le débogage
    if (typeof window !== 'undefined') {
      logger.debug('[AuthContext] Initialisation...')
    }

    try {
      // Vérifier si token existe dans localStorage
      const storedToken = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('ott_token') : null
      const storedUser = typeof window !== 'undefined' && window.localStorage ? window.localStorage.getItem('ott_user') : null

      if (typeof window !== 'undefined') {
        logger.debug('[AuthContext] localStorage:', { 
          hasToken: !!storedToken, 
          hasUser: !!storedUser,
          tokenLength: storedToken?.length || 0
        })
      }

      if (storedToken && storedUser) {
        try {
          const parsedUser = JSON.parse(storedUser)
          
          // Vérifier que l'utilisateur a les champs essentiels
          if (!parsedUser.id || !parsedUser.email || !parsedUser.role_name) {
            logger.warn('[AuthContext] Données utilisateur incomplètes, nettoyage...')
            if (typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.removeItem('ott_token')
              window.localStorage.removeItem('ott_user')
            }
            setLoading(false)
            return
          }
          
          // Vérifier que les permissions sont présentes (même si vide)
          if (parsedUser.permissions === undefined) {
            logger.warn('[AuthContext] Permissions manquantes, initialisation...')
            parsedUser.permissions = []
          }
          
          setUser(parsedUser)
          setToken(storedToken)
          if (typeof window !== 'undefined') {
            logger.debug('[AuthContext] Utilisateur restauré:', {
              email: parsedUser.email,
              role: parsedUser.role_name,
              hasPermissions: Array.isArray(parsedUser.permissions),
              permissionsCount: Array.isArray(parsedUser.permissions) ? parsedUser.permissions.length : 0
            })
          }
        } catch (parseError) {
          logger.error('[AuthContext] Erreur parsing user:', parseError)
          // Nettoyer les données corrompues
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('ott_token')
            window.localStorage.removeItem('ott_user')
          }
        }
      } else {
        if (typeof window !== 'undefined') {
          logger.debug('[AuthContext] Aucun utilisateur stocké')
        }
      }
    } catch (error) {
      logger.error('[AuthContext] Erreur lors de l\'initialisation:', error)
    } finally {
      setLoading(false)
      if (typeof window !== 'undefined') {
        logger.debug('[AuthContext] Initialisation terminée, loading=false')
      }
    }
  }, [])

  return { user, token, setUser, setToken, loading }
};

/**
 * Hook personnalisé pour effectuer des actions d'authentification
 * @returns {{ login: Function, logout: Function, fetchWithAuth: Function, authLoading: boolean }} Objet contenant les actions et l'état de chargement
 */
export const useAuthActions = () => {
  const { user, token, setUser, setToken } = useAuthState()
  const [authLoading, setAuthLoading] = useState(false)

  /**
   * Effectue une connexion à l'API
   * @param {string} email - L'email de l'utilisateur
   * @param {string} password - Le mot de passe de l'utilisateur
   * @returns {Promise<object>} La réponse de l'API
   */
  const login = async (email, password) => {
    setAuthLoading(true)
    try {
      const loginUrl = buildClientApiUrl('/api.php/auth/login')
      
      // Log pour debug
      if (typeof window !== 'undefined') {
        logger.debug('[AuthContext] Tentative de connexion vers:', loginUrl)
      }
      
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })

      // Vérifier si la réponse est du JSON ou du HTML (erreur PHP)
      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')
      
      // Si erreur HTTP ou réponse non-JSON, gérer l'erreur
      if (!response.ok || !isJson) {
        const text = await response.text()
        logger.error('[AuthContext] ❌ Erreur serveur')
        logger.error('[AuthContext] Status:', response.status)
        logger.error('[AuthContext] Content-Type:', contentType)
        logger.error('[AuthContext] Réponse complète:', text)
        
        // Essayer de parser comme JSON si possible
        let errorMessage = `Erreur serveur (${response.status})`
        try {
          const jsonError = JSON.parse(text)
          errorMessage = jsonError.error || jsonError.message || errorMessage
        } catch (_e) {
          // Si ce n'est pas du JSON, extraire le message d'erreur du HTML si possible
          if (text.includes('Parse error') || text.includes('Fatal error') || text.includes('Warning')) {
            // Extraire le message d'erreur PHP
            const errorMatch = text.match(/(?:Parse error|Fatal error|Warning):\s*(.+?)(?:\n|$)/i)
            if (errorMatch) {
              errorMessage = `Erreur PHP: ${errorMatch[1].substring(0, 200)}`
            } else {
              errorMessage = `Erreur serveur (${response.status}). L'API distante ne répond pas correctement.`
            }
          } else if (text.includes('Database') || text.includes('Connection')) {
            errorMessage = 'Erreur de connexion à la base de données'
          } else if (response.status === 500) {
            errorMessage = 'Erreur serveur interne. L\'API distante rencontre un problème.'
          }
        }
        
        // Logger dans localStorage pour analyse
        if (typeof window !== 'undefined') {
          const logEntry = `[${new Date().toISOString()}] ERREUR API\n` +
            `URL: ${buildClientApiUrl('/api.php/auth/login')}\n` +
            `Status: ${response.status}\n` +
            `Content-Type: ${contentType}\n` +
            `Réponse: ${text.substring(0, 1000)}\n\n`
          try {
            window.localStorage.setItem('api_error_log', logEntry)
            logger.debug('[AuthContext] 💾 Log sauvegardé dans localStorage')
          } catch (e) {
            logger.error('[AuthContext] Erreur sauvegarde log:', e)
          }
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Erreur de connexion')
      }

      // S'assurer que les permissions sont toujours un tableau
      const userData = { ...data.user }
      if (!Array.isArray(userData.permissions)) {
        if (typeof userData.permissions === 'string' && userData.permissions.length > 0) {
          userData.permissions = userData.permissions.split(',').map(p => p.trim()).filter(p => p.length > 0)
        } else {
          userData.permissions = []
        }
      }
      
      setUser(userData)
      setToken(data.token)

      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('ott_token', data.token)
        window.localStorage.setItem('ott_user', JSON.stringify(userData))
      }
      
      if (typeof window !== 'undefined') {
        logger.debug('[AuthContext] Utilisateur sauvegardé:', {
          email: userData.email,
          role: userData.role_name,
          permissionsCount: userData.permissions.length
        })
      }

      return data
    } catch (err) {
      // Si c'est déjà une erreur formatée, la relancer
      if (err.message && err.message.includes('Erreur serveur')) {
        throw err
      }
      
      // Gérer spécifiquement les erreurs "Failed to fetch"
      if (err.message && err.message.includes('Failed to fetch')) {
        const loginUrl = buildClientApiUrl('/api.php/auth/login')
        logger.error('[AuthContext] ❌ Erreur réseau lors de la connexion:', err)
        logger.error('[AuthContext] URL tentée:', loginUrl)
        
        // Messages d'erreur plus spécifiques
        let errorMessage = 'Impossible de se connecter au serveur.'
        
        if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
          errorMessage = 'Impossible de se connecter au serveur. Vérifiez que le serveur Next.js est démarré et que le proxy fonctionne correctement.'
        } else {
          errorMessage = 'Impossible de se connecter au serveur. Vérifiez votre connexion internet et que l\'API est accessible.'
        }
        
        throw new Error(errorMessage)
      }
      
      // Sinon, c'est probablement une erreur de parsing JSON ou autre
      logger.error('[AuthContext] ❌ Erreur lors de la connexion:', err)
      throw new Error(err.message || 'Erreur de connexion au serveur. Vérifiez votre connexion internet.')
    } finally {
      setAuthLoading(false)
    }
  };

  /**
   * Effectue une déconnexion de l'API
   */
  const logout = () => {
    const setUser = useState()[1]
    setUser(null)
    const setToken = useState()[1]
    setToken(null)
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem('ott_token')
      window.localStorage.removeItem('ott_user')
    }
    
    // Rediriger vers la page de connexion si on est dans le dashboard
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/dashboard')) {
      logger.debug('[AuthContext] Redirection vers / après logout')
      window.location.href = '/'
    }
  };

  /**
   * Effectue une requête à l'API avec authentification
   * @param {string} url - L'URL de la requête
   * @param {object} options - Les options de la requête
   * @param {object} config - La configuration de la requête
   * @returns {Promise<object>} La réponse de l'API
   */
  const fetchWithAuth = async (url, options = {}, config = {}) => {
    const { requiresAuth = false } = config
    const finalOptions = { ...options }
    const headers = { ...(options.headers || {}) }

    // Toujours accepter le JSON pour éviter les erreurs de content-type
    headers['Accept'] = 'application/json'

    if (finalOptions.body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json'
    }

    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    } else if (requiresAuth || REQUIRE_AUTH) {
      throw new Error('Non authentifié')
    }

    finalOptions.headers = headers
    const targetUrl = buildClientApiUrl(url)

    const response = await fetch(targetUrl, finalOptions)

    if (response.status === 401 && token) {
      logout()
      throw new Error('Session expirée')
    }

    return response
  }

  return { login, logout, fetchWithAuth, authLoading }
};

/**
 * Fournisseur d'authentification pour l'application
 * @param {object} props - Props du composant
 * @param {React.ReactNode} props.children - Enfants du composant
 * @returns {JSX.Element} Le composant AuthProvider
 */
export function AuthProvider({ children }) {
  const authState = useAuthState()
  const authActions = useAuthActions()

  return (
    <AuthContext.Provider value={{ ...authState, ...authActions, API_URL }}>
      {children}
    </AuthContext.Provider>
  )
}

/**
 * Hook personnalisé pour accéder au contexte d'authentification
 * @returns {object} Le contexte d'authentification
 */
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth doit être utilisé dans AuthProvider')
  }
  return context
}
