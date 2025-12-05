'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import ConfirmModal from '@/components/ConfirmModal'
import logger from '@/lib/logger'

export default function Topbar() {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [showMenu, setShowMenu] = useState(false)
  const [isDark, setIsDark] = useState(false)
  const [showClearCacheModal, setShowClearCacheModal] = useState(false)

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

  const handleClearCache = async () => {
    
    try {
      // Désinscrire tous les service workers
      const registrations = await navigator.serviceWorker.getRegistrations()
      for (const reg of registrations) {
        await reg.unregister()
        logger.debug('✅ Service worker désinscrit')
      }
      
      // Vider tous les caches
      const cacheNames = await caches.keys()
      for (const name of cacheNames) {
        await caches.delete(name)
        logger.debug('✅ Cache supprimé:', name)
      }
      
      // Recharger la page
      setTimeout(() => window.location.reload(true), 500)
    } catch (err) {
      logger.error('❌ Erreur lors du nettoyage:', err)
    } finally {
      setShowClearCacheModal(false)
    }
  }

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-white via-white to-primary-50/30 dark:from-[rgb(var(--night-bg-start))] dark:via-[rgb(var(--night-bg-mid))] dark:to-[rgb(var(--night-blue-start))] border-b border-gray-200/80 dark:border-[rgb(var(--night-border))] z-50 backdrop-blur-md shadow-sm">
      <div className="flex items-center justify-between h-full px-6">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-secondary-500 rounded-lg flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 animate-float">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-secondary-600 bg-clip-text text-transparent">
              OTT Dashboard Pro
            </h1>
            <p className="text-xs text-gray-500 dark:text-[rgb(var(--night-text-muted))]">HAPPLYZ MEDICAL SAS</p>
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
              className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-[rgb(var(--night-surface-hover))] transition-all"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-primary-400 to-secondary-400 rounded-full flex items-center justify-center text-white font-bold">
                {demoUser?.first_name?.[0]}{demoUser?.last_name?.[0]}
              </div>
              <div className="text-left">
                <p className="text-sm font-medium dark:text-[rgb(var(--night-text-primary))]">{demoUser?.first_name} {demoUser?.last_name}</p>
                <p className="text-xs text-gray-500 dark:text-[rgb(var(--night-text-muted))]">{demoUser?.role_name}</p>
              </div>
              <svg className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown */}
            {showMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-gradient-to-br from-white to-gray-50/80 dark:from-[rgb(var(--night-surface))] dark:via-[rgb(var(--night-bg-mid))] dark:to-[rgb(var(--night-blue-start))]/20 rounded-lg shadow-xl border border-gray-100/80 dark:border-[rgb(var(--night-border))] animate-slide-down backdrop-blur-md">
                <button
                  onClick={() => {
                    setShowClearCacheModal(true)
                    setShowMenu(false)
                  }}
                  className="w-full px-4 py-2 text-left text-gray-700 dark:text-gray-300 hover:bg-gradient-to-r hover:from-gray-50 hover:to-gray-50/50 dark:hover:from-gray-800/20 dark:hover:to-gray-800/10 rounded-lg transition-all duration-200"
                >
                  🧹 Vider le cache
                </button>
                <button
                  onClick={() => {
                    handleLogout()
                    setShowMenu(false)
                  }}
                  className="w-full px-4 py-2 text-left text-red-600 dark:text-red-400 hover:bg-gradient-to-r hover:from-red-50 hover:to-red-50/50 dark:hover:from-red-900/20 dark:hover:to-red-900/10 rounded-lg transition-all duration-200"
                >
                  🚪 Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmation vider cache */}
      <ConfirmModal
        isOpen={showClearCacheModal}
        onClose={() => setShowClearCacheModal(false)}
        onConfirm={handleClearCache}
        title="Vider le cache"
        message="Cette action va vider tous les caches et service workers, puis recharger la page. Continuer ?"
        confirmText="Vider et recharger"
        variant="warning"
      />
    </header>
  )
}

