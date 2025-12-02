'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { withBasePath } from '@/lib/utils'

// Menu simplifié - 4 pages principales avec fonctionnalités regroupées
const menuStructure = [
  {
    name: 'Vue d\'Ensemble',
    icon: '🏠',
    path: '/dashboard',
    permission: null
  },
  {
    name: 'Dispositifs OTT',
    icon: '🔌',
    path: '/dashboard/outils',
    permission: null, // Vérifié dans la page (admin/technicien)
    description: 'Upload firmware, flash USB et streaming'
  },
  {
    name: 'Patients',
    icon: '🏥',
    path: '/dashboard/patients',
    permission: 'patients.view',
    description: 'Gestion des patients'
  },
  {
    name: 'Utilisateurs',
    icon: '👨‍💼',
    path: '/dashboard/users',
    permission: 'users.view',
    description: 'Gestion des utilisateurs (audit, notifications, paramètres)'
  },
]

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  
  // Garder le menu documentation ouvert si on est sur la page documentation
  const isOnDocumentationPage = pathname === '/dashboard/documentation'
  const [isDocsOpen, setIsDocsOpen] = useState(isOnDocumentationPage)
  const [userManuallyClosed, setUserManuallyClosed] = useState(false)
  
  // Obtenir le doc actuel depuis les search params (réactif)
  const currentDoc = useMemo(() => {
    return searchParams.get('doc') || 'presentation'
  }, [searchParams])
  
  const hasPermission = (permission) => {
    if (!permission) return true
    if (user?.role_name === 'admin') return true
    return user?.permissions?.includes(permission)
  }

  // Normaliser le pathname pour la comparaison
  const normalizedPathname = useMemo(() => {
    if (!pathname) return ''
    return pathname
  }, [pathname])
  
  // Gérer l'ouverture automatique du menu et la réinitialisation du flag
  useEffect(() => {
    if (isOnDocumentationPage) {
      // Ouvrir automatiquement si l'utilisateur ne l'a pas fermé manuellement
      if (!userManuallyClosed) {
        setIsDocsOpen(true)
      }
    } else {
      // Réinitialiser le flag quand on quitte la page documentation
      setUserManuallyClosed(false)
    }
  }, [isOnDocumentationPage, userManuallyClosed])
  
  const documentationLinks = [
    { name: 'Présentation', icon: '📸', doc: 'presentation' },
    { name: 'Développeurs', icon: '💻', doc: 'developpeurs' },
    { name: 'Commerciale', icon: '💼', doc: 'commerciale' },
    { name: 'Suivi Temps', icon: '⏱️', doc: 'suivi-temps' },
  ]

  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-gradient-to-b from-white via-white to-primary-50/20 dark:from-[rgb(var(--night-bg-start))] dark:via-[rgb(var(--night-bg-mid))] dark:to-[rgb(var(--night-blue-start))] border-r border-gray-200/80 dark:border-[rgb(var(--night-border))] overflow-y-auto backdrop-blur-sm">
      <nav className="p-4 space-y-1">
        {menuStructure.map((item) => {
          if (!hasPermission(item.permission)) return null
          
          // Vérification spéciale pour le menu Dispositifs OTT (admin ou technicien uniquement)
          if (item.path === '/dashboard/outils') {
            if (user?.role_name !== 'admin' && user?.role_name !== 'technicien') {
              return null
            }
          }
          
          // Logique d'activation : pour /dashboard, seulement si exactement /dashboard
          // Pour les autres, si le pathname correspond exactement ou commence par le path + '/'
          const isActive = item.path === '/dashboard'
            ? normalizedPathname === '/dashboard'
            : normalizedPathname === item.path || normalizedPathname.startsWith(item.path + '/')
          
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all duration-300 group
                ${isActive 
                  ? 'bg-gradient-to-r from-primary-500 to-secondary-500 text-white shadow-lg scale-[1.02] animate-glow' 
                  : 'text-gray-700 dark:text-[rgb(var(--night-text-secondary))] hover:bg-gradient-to-r hover:from-gray-100/80 hover:to-gray-50/50 dark:hover:from-[rgb(var(--night-surface-hover))] dark:hover:to-[rgb(var(--night-blue-start))]/20 hover:scale-[1.01]'
                }
              `}
              title={item.description || undefined}
            >
              <span className="text-xl transition-transform duration-300 group-hover:scale-110">{item.icon}</span>
              <span>{item.name}</span>
              {isActive && (
                <div className="ml-auto w-2 h-2 bg-white/90 dark:bg-slate-800 rounded-full animate-pulse"></div>
              )}
            </Link>
          )
        })}
      </nav>
      
      {/* Footer Sidebar - Menu déroulant Documentation */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-white/90 via-primary-50/30 to-transparent dark:from-[rgb(var(--night-bg-start))] dark:via-[rgb(var(--night-bg-mid))] dark:to-transparent backdrop-blur-sm">
        <div className="relative flex flex-col-reverse">
          {/* Menu déroulant - se déploie vers le haut (au-dessus du bouton) */}
          {isDocsOpen && (
            <div className="mt-2 space-y-1 animate-fade-in">
              {documentationLinks.map((doc) => {
                // Vérifier si ce doc est actif (seul celui-ci passe en violet)
                const isActive = isOnDocumentationPage && currentDoc === doc.doc
                
                return (
                  <Link
                    key={doc.doc}
                    href={`/dashboard/documentation?doc=${doc.doc}`}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-300 hover:scale-[1.02] shadow-sm text-sm ${
                      isActive
                        ? 'bg-gradient-to-r from-primary-500 to-secondary-500 text-white font-semibold'
                        : 'bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/30 dark:to-primary-800/20 text-primary-700 dark:text-primary-300 hover:from-primary-100 hover:to-primary-100 dark:hover:from-primary-900/50 dark:hover:to-primary-800/30'
                    }`}
                  >
                    <span>{doc.icon}</span>
                    <span className="font-medium">{doc.name}</span>
                    {isActive && (
                      <div className="ml-auto w-2 h-2 bg-white/90 dark:bg-slate-800 rounded-full animate-pulse"></div>
                    )}
                  </Link>
                )
              })}
            </div>
          )}
          
          {/* Bouton Documentation avec triangle */}
          <div className="w-full flex items-center justify-between gap-2 px-4 py-2 rounded-lg transition-all duration-300 shadow-sm text-sm font-medium bg-gradient-to-r from-primary-50 to-primary-100/50 dark:from-primary-900/30 dark:to-primary-800/20 text-primary-700 dark:text-primary-300">
            {/* Texte Documentation - non cliquable, ne fait rien */}
            <div className="flex items-center gap-2 flex-1">
              <span>📚</span>
              <span>Documentation</span>
            </div>
            
            {/* Triangle pour déployer/minimiser - SEUL élément qui toggle le menu */}
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const newState = !isDocsOpen
                setIsDocsOpen(newState)
                // Si l'utilisateur ferme le menu manuellement, marquer qu'il l'a fait
                if (!newState && isOnDocumentationPage) {
                  setUserManuallyClosed(true)
                } else if (newState) {
                  // Si l'utilisateur ouvre le menu, réinitialiser le flag
                  setUserManuallyClosed(false)
                }
              }}
              className="p-1 rounded transition-all duration-300 hover:scale-110 hover:bg-primary-200/50 dark:hover:bg-primary-800/50"
              aria-label={isDocsOpen ? 'Masquer les docs' : 'Afficher les docs'}
            >
              <span className={`transition-transform duration-300 block ${isDocsOpen ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}

