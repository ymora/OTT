'use client'

import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext()

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ott-api.onrender.com'

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
    const response = await fetch(`${API_URL}/api.php/auth/login`, {
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

  const fetchWithAuth = async (url, options = {}) => {
    if (!token) throw new Error('Non authentifié')

    options.headers = {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }

    const response = await fetch(url, options)

    if (response.status === 401) {
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

