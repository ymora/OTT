'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      await login(email, password)
      router.replace('/dashboard')
    } catch (err) {
      setError(err.message || 'Erreur de connexion')
      setLoading(false)
    }
  }

  const handleClearCache = async (e) => {
    e.preventDefault()
    if (window._isClearingCache) return
    if (!confirm('Vider le cache et recharger ?')) return
    
    window._isClearingCache = true
    try {
      const regs = await navigator.serviceWorker.getRegistrations()
      regs.forEach(r => r.unregister())
      const caches = await caches.keys()
      caches.forEach(c => caches.delete(c))
      localStorage.clear()
      setTimeout(() => window.location.reload(true), 1000)
    } catch (err) {
      console.error('Erreur:', err)
      window._isClearingCache = false
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800 mb-2">OTT Dashboard</h1>
          <p className="text-sm text-gray-600">HAPPLYZ MEDICAL</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="votre@email.com"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 text-white py-2 rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connexion...' : 'Connexion'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={handleClearCache}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Vider le cache
          </button>
        </div>
      </div>
    </div>
  )
}

