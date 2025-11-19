 'use client'
 
 import { createContext, useContext, useState, useEffect } from 'react'
 
 const AuthContext = createContext()
 
 const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://ott-jbln.onrender.com').replace(/\/$/, '')
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
    // Vérifier si token existe dans localStorage
    const storedToken = localStorage.getItem('ott_token')
    const storedUser = localStorage.getItem('ott_user')

    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
    }

    setLoading(false)
  }, [])

  const login = async (email, password) => {
    const response = await fetch(buildClientApiUrl('/api.php/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json()

    if (!data.success) {
      throw new Error(data.error || 'Erreur de connexion')
    }

    setToken(data.token)
    setUser(data.user)

    localStorage.setItem('ott_token', data.token)
    localStorage.setItem('ott_user', JSON.stringify(data.user))

    return data
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

