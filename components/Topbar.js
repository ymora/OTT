'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'

export default function Topbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Vérifier la préférence sauvegardée ou la préférence système
    const saved = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const darkMode = saved === 'dark' || (!saved && prefersDark)
    setIsDark(darkMode)
    applyTheme(darkMode)
  }, [])

  const applyTheme = (dark) => {
    if (dark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }

  const toggleTheme = () => {
    const newTheme = !isDark
    setIsDark(newTheme)
    applyTheme(newTheme)
  }

  // ⚠️ Utilisateur fictif en mode DÉMO
  const demoUser = user || {
    first_name: 'Démo',
    last_name: 'User',
    role_name: 'admin'
  }

  const handleLogout = () => {
    logout()
    // Next.js gère automatiquement le basePath
    router.push('/')
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-50">
      <div className="flex items-center justify-between h-full px-6">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-lg flex items-center justify-center shadow-md">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
              OTT Dashboard Pro
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">HAPPLYZ MEDICAL SAS</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* Toggle Dark/Light Mode */}
          <button 
            className="btn-secondary hover:scale-110 transition-transform duration-200"
            onClick={toggleTheme}
            title={isDark ? "Passer en mode clair" : "Passer en mode sombre"}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-secondary-400 rounded-full flex items-center justify-center text-white font-bold">
                {demoUser?.first_name?.[0]}{demoUser?.last_name?.[0]}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium dark:text-gray-100">{demoUser?.first_name} {demoUser?.last_name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{demoUser?.role_name}</p>
              </div>
              <svg className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-100 dark:border-gray-700 animate-slide-down">
                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                >
                  🚪 Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

