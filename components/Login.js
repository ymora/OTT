'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const redirectTimeoutRef = useRef(null)
  
  // Cleanup timeout au démontage
  useEffect(() => {
    return () => {
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current)
      }
    }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (loading) return
    
    setLoading(true)
    setError('')

    try {
      await login(email, password)
      // Redirection avec Next.js router pour gérer automatiquement le basePath
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current)
      }
      redirectTimeoutRef.current = setTimeout(() => {
        router.push('/dashboard')
      }, 100)
    } catch (err) {
      setError(err.message || 'Erreur de connexion')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 via-primary-600 to-secondary-500 flex items-center justify-center p-4">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-white/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-white/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
      </div>

      {/* Login Card */}
      <div className="relative w-full max-w-md">
        <div className="card animate-slide-up shadow-2xl border-0">
          {/* Logo et Titre */}
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg">
              <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent mb-2">
              OTT Dashboard
            </h1>
            <p className="text-gray-600 dark:text-gray-300">HAPPLYZ MEDICAL SAS</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="group">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                📧 Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input group-hover:border-primary-300 focus:border-primary-500"
                placeholder="votre@email.com"
                required
                disabled={loading}
              />
            </div>

            <div className="group">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                🔐 Mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input group-hover:border-primary-300 focus:border-primary-500"
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg animate-slide-down">
                <p className="text-sm">❌ {error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary py-3 text-lg disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden group"
            >
              <span className={loading ? 'opacity-0' : 'opacity-100'}>
                Connexion
              </span>
              {loading && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-primary-600 to-secondary-600 opacity-0 group-hover:opacity-100 transition-opacity -z-10"></div>
            </button>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-700 text-center">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Besoin d&apos;un accès de démonstration&nbsp;?
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Contactez support@happlyz.com pour obtenir des identifiants temporaires.
            </p>
          </div>
        </div>

        {/* Version badge */}
        <div className="text-center mt-6 text-white/80 text-sm">
          Version 3.0.0 Enterprise | © 2025 HAPPLYZ MEDICAL
        </div>
      </div>
    </div>
  )
}

