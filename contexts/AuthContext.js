 'use client' 
 
 import { createContext, useContext, useState, useEffect } from 'react'
 import logger from '@/lib/logger'
 
 const AuthContext = createContext()
 
// URL de l'API - utiliser le proxy Next.js en local, Render directement en production
// En local (port 3000), utiliser le proxy Next.js qui route vers l'API distante (évite CORS)
// En production (en ligne), utiliser Render directement
const getDefaultApiUrl = () => {
  // Si on est en local (pas en production), utiliser le proxy Next.js
  // Le proxy Next.js route /api.php/* vers l'API distante et gère CORS automatiquement
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    // Utiliser le proxy Next.js (même origine, pas de problème CORS)
    return window.location.origin // http://localhost:3000
  }
  // Sinon, utiliser Render directement (production)
  return 'https://ott-jbln.onrender.com'
}

// Priorité: 1) proxy Next.js si localhost, 2) variable d'environnement, 3) défaut Render
const API_URL = (() => {
  // En local, utiliser le proxy Next.js pour éviter les problèmes CORS
  // En production, utiliser l'URL distante directement
  if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
    return window.location.origin
  }
  return (process.env.NEXT_PUBLIC_API_URL || 'https://ott-jbln.onrender.com')
})().replace(/\/$/, '')
 const isAbsoluteUrl = url => /^https?:\/\//i.test(url)
 
 const buildAbsoluteApiUrl = (input = '') => {
   if (!input) return API_URL
   if (isAbsoluteUrl(input)) return input
   if (input.startsWith('/')) return `${API_URL}${input}`
   return `${API_URL}/${input}`
 }
 
const buildClientApiUrl = input => buildAbsoluteApiUrl(input)
// Authentification toujours requise
const REQUIRE_AUTH = true

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Logging pour le débogage
    if (typeof window !== 'undefined') {
      logger.debug('[AuthContext] Initialisation...')
    }

    try {
      // Vérifier si token existe dans localStorage
      const storedToken = localStorage.getItem('ott_token')
      const storedUser = localStorage.getItem('ott_user')

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
          setToken(storedToken)
          setUser(parsedUser)
          if (typeof window !== 'undefined') {
            logger.debug('[AuthContext] Utilisateur restauré:', parsedUser.email || parsedUser.username)
          }
        } catch (parseError) {
          logger.error('[AuthContext] Erreur parsing user:', parseError)
          // Nettoyer les données corrompues
          localStorage.removeItem('ott_token')
          localStorage.removeItem('ott_user')
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

  const login = async (email, password) => {
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
        } catch (e) {
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
            localStorage.setItem('api_error_log', logEntry)
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

      setToken(data.token)
      setUser(data.user)

      localStorage.setItem('ott_token', data.token)
      localStorage.setItem('ott_user', JSON.stringify(data.user))

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
    }
  }

  const logout = () => {
    setToken(null)
    setUser(null)
    localStorage.removeItem('ott_token')
    localStorage.removeItem('ott_user')
  }

  const fetchWithAuth = async (url, options = {}, config = {}) => {
    const { requiresAuth = false } = config
    const finalOptions = { ...options }
    const headers = { ...(options.headers || {}) }

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

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, fetchWithAuth, API_URL }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth doit être utilisé dans AuthProvider')
  }
  return context
}

